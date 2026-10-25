import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/shared/api';
import type { FileTreeDirectoryStatus, FileTreeNode, Project } from '@/shared/types';

type UseFileTreeDataResult = {
  files: FileTreeNode[];
  loading: boolean;
  error: string | null;
  refreshFiles: () => void;
  /** Increments on every refresh, for caches that must be rebuilt alongside the tree. */
  refreshKey: number;
  /** Fetches a folder's first page unless it is already loaded or loading. */
  loadDirectory: (directoryPath: string) => void;
  /** Fetches the next page of a folder, or retries a folder whose first page failed. */
  loadMoreEntries: (directoryPath: string) => void;
  /** Loading state of one folder; the project root is `ROOT_DIRECTORY_KEY`. */
  getDirectoryStatus: (directoryPath: string) => FileTreeDirectoryStatus | null;
  showAllFiles: boolean;
  setShowAllFiles: (showAllFiles: boolean) => void;
};

/** One page as returned by `GET /api/file-tree/projects/:projectId/files/children`. */
type DirectoryPageResponse = {
  path: string;
  entries: FileTreeNode[];
  nextOffset: number | null;
  totalEntries: number;
};

type DirectoryState = {
  entries: FileTreeNode[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  nextOffset: number | null;
  totalEntries: number;
};

/** The project root's key in the directory map; every other folder is keyed by its absolute path. */
export const ROOT_DIRECTORY_KEY = '';

const DEFAULT_LOAD_ERROR = 'Unable to load the file tree for this project.';
const DIRECTORY_PAGE_SIZE = 200;
// The server's per-request ceiling; a refresh re-reads up to this many entries
// of a folder whose extra pages the user had already loaded.
const MAXIMUM_DIRECTORY_PAGE_SIZE = 1_000;
const SHOW_ALL_FILES_STORAGE_KEY = 'file-tree-show-all';

const EMPTY_DIRECTORY_STATE: DirectoryState = {
  entries: [],
  loaded: false,
  loading: true,
  error: null,
  nextOffset: null,
  totalEntries: 0,
};

// The API reports refusals such as PATH_OUTSIDE_PROJECT as { error: message }.
// Surfacing that message tells the user why a folder is missing, instead of
// leaving them with an unexplained empty folder.
function readResponseErrorMessage(responseBody: string): string | null {
  try {
    const parsedBody = JSON.parse(responseBody) as unknown;
    const message = typeof parsedBody === 'object' && parsedBody !== null && 'error' in parsedBody
      ? (parsedBody as { error: unknown }).error
      : null;
    return typeof message === 'string' && message.trim() ? message : null;
  } catch {
    return null;
  }
}

function readStoredShowAllFiles(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_FILES_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string }).name === 'AbortError';
}

/**
 * Loads the project folder by folder: the root on open, then each folder when
 * it is expanded, one page at a time. Nothing walks the whole project, so a
 * project of any size opens.
 */
export function useFileTreeData(selectedProject: Project | null): UseFileTreeDataResult {
  const projectId = selectedProject?.projectId ?? null;
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [showAllFiles, setShowAllFilesState] = useState(readStoredShowAllFiles);
  const [refreshKey, setRefreshKey] = useState(0);
  // Read inside callbacks so they do not have to be recreated on every page.
  const directoriesRef = useRef(directories);
  // Each project, filter or refresh starts a new generation; responses from an
  // older one are dropped and its requests aborted.
  const generationRef = useRef<{ id: number; projectId: string; controller: AbortController } | null>(null);

  useEffect(() => {
    directoriesRef.current = directories;
  }, [directories]);

  const fetchPage = useCallback(async (
    directoryKey: string,
    offset: number,
    limit: number,
  ): Promise<DirectoryPageResponse> => {
    const generation = generationRef.current;
    if (!projectId || !generation) {
      throw new Error(DEFAULT_LOAD_ERROR);
    }

    const response = await api.getDirectoryEntries(projectId, {
      path: directoryKey === ROOT_DIRECTORY_KEY ? null : directoryKey,
      offset,
      limit,
      showAll: showAllFiles,
    }, { signal: generation.controller.signal });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(readResponseErrorMessage(errorText) ?? DEFAULT_LOAD_ERROR);
    }

    return (await response.json()) as DirectoryPageResponse;
  }, [projectId, showAllFiles]);

  const updateDirectory = useCallback((
    generationId: number,
    directoryKey: string,
    update: (previous: DirectoryState | undefined) => DirectoryState | null,
  ) => {
    if (generationRef.current?.id !== generationId) {
      return;
    }
    setDirectories((previous) => {
      const next = { ...previous };
      const updated = update(previous[directoryKey]);
      if (updated) {
        next[directoryKey] = updated;
      } else {
        delete next[directoryKey];
      }
      return next;
    });
  }, []);

  const requestPage = useCallback((directoryKey: string, offset: number, limit: number, append: boolean) => {
    const generationId = generationRef.current?.id;
    if (generationId === undefined) {
      return;
    }

    updateDirectory(generationId, directoryKey, (previous) => ({
      ...(previous ?? EMPTY_DIRECTORY_STATE),
      loading: true,
      error: null,
    }));

    fetchPage(directoryKey, offset, limit)
      .then((page) => {
        updateDirectory(generationId, directoryKey, (previous) => ({
          entries: append && previous ? [...previous.entries, ...page.entries] : page.entries,
          loaded: true,
          loading: false,
          error: null,
          nextOffset: page.nextOffset,
          totalEntries: page.totalEntries,
        }));
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
        console.error(`Error loading directory "${directoryKey || 'project root'}":`, error);
        updateDirectory(generationId, directoryKey, (previous) => ({
          ...(previous ?? EMPTY_DIRECTORY_STATE),
          loading: false,
          error: error instanceof Error ? error.message : DEFAULT_LOAD_ERROR,
        }));
      });
  }, [fetchPage, updateDirectory]);

  // A new project, filter or refresh: re-read the root and every folder that
  // was open, each with as many entries as had been paged in, so the visible
  // tree survives the reload instead of collapsing to the root.
  useEffect(() => {
    generationRef.current?.controller.abort();
    if (!projectId) {
      generationRef.current = null;
      setDirectories({});
      return;
    }

    const generation = {
      id: (generationRef.current?.id ?? 0) + 1,
      projectId,
      controller: new AbortController(),
    };
    const previousDirectories = directoriesRef.current;
    const isSameProject = generationRef.current?.projectId === projectId;
    generationRef.current = generation;

    const directoriesToReload = isSameProject
      ? Object.entries(previousDirectories).filter(([, state]) => state.loaded)
      : [];
    if (!directoriesToReload.some(([directoryKey]) => directoryKey === ROOT_DIRECTORY_KEY)) {
      directoriesToReload.unshift([ROOT_DIRECTORY_KEY, EMPTY_DIRECTORY_STATE]);
    }

    const reloadingDirectories = Object.fromEntries(directoriesToReload.map(([directoryKey, state]) => [
      directoryKey,
      { ...state, loading: true, error: null },
    ]));
    directoriesRef.current = reloadingDirectories;
    setDirectories(reloadingDirectories);

    directoriesToReload.forEach(([directoryKey, state]) => {
      const limit = Math.min(Math.max(DIRECTORY_PAGE_SIZE, state.entries.length), MAXIMUM_DIRECTORY_PAGE_SIZE);
      fetchPage(directoryKey, 0, limit)
        .then((page) => {
          updateDirectory(generation.id, directoryKey, () => ({
            entries: page.entries,
            loaded: true,
            loading: false,
            error: null,
            nextOffset: page.nextOffset,
            totalEntries: page.totalEntries,
          }));
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) {
            return;
          }
          // A folder deleted or renamed since it was opened simply drops out;
          // only the root's failure is the tree's error.
          if (directoryKey !== ROOT_DIRECTORY_KEY) {
            updateDirectory(generation.id, directoryKey, () => null);
            return;
          }
          console.error('Error loading the project root:', error);
          updateDirectory(generation.id, directoryKey, (previous) => ({
            ...(previous ?? EMPTY_DIRECTORY_STATE),
            entries: [],
            loading: false,
            error: error instanceof Error ? error.message : DEFAULT_LOAD_ERROR,
          }));
        });
    });

    return () => {
      generation.controller.abort();
    };
  }, [projectId, showAllFiles, refreshKey, fetchPage, updateDirectory]);

  const refreshFiles = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  const loadDirectory = useCallback((directoryPath: string) => {
    if (directoriesRef.current[directoryPath]) {
      return;
    }
    // Marked before the request so a second render in the same tick does not
    // request the folder twice.
    directoriesRef.current = { ...directoriesRef.current, [directoryPath]: EMPTY_DIRECTORY_STATE };
    requestPage(directoryPath, 0, DIRECTORY_PAGE_SIZE, false);
  }, [requestPage]);

  const loadMoreEntries = useCallback((directoryPath: string) => {
    const state = directoriesRef.current[directoryPath];
    if (!state || state.loading) {
      return;
    }
    if (!state.loaded) {
      requestPage(directoryPath, 0, DIRECTORY_PAGE_SIZE, false);
      return;
    }
    if (state.nextOffset !== null) {
      requestPage(directoryPath, state.nextOffset, DIRECTORY_PAGE_SIZE, true);
    }
  }, [requestPage]);

  const setShowAllFiles = useCallback((nextShowAllFiles: boolean) => {
    setShowAllFilesState(nextShowAllFiles);
    try {
      localStorage.setItem(SHOW_ALL_FILES_STORAGE_KEY, String(nextShowAllFiles));
    } catch {
      // The choice still applies for this visit when storage is unavailable.
    }
  }, []);

  const getDirectoryStatus = useCallback((directoryPath: string): FileTreeDirectoryStatus | null => {
    const state = directories[directoryPath];
    if (!state) {
      return null;
    }
    return {
      loaded: state.loaded,
      loading: state.loading,
      error: state.error,
      remainingEntries: state.nextOffset === null ? 0 : Math.max(0, state.totalEntries - state.nextOffset),
    };
  }, [directories]);

  // Folders carry `children` only once their first page is in, which is what
  // tells a row whether to show its entries or a loading placeholder.
  const files = useMemo(() => {
    const attachChildren = (entries: FileTreeNode[]): FileTreeNode[] => entries.map((entry) => {
      const state = entry.type === 'directory' ? directories[entry.path] : undefined;
      return state?.loaded ? { ...entry, children: attachChildren(state.entries) } : entry;
    });
    return attachChildren(directories[ROOT_DIRECTORY_KEY]?.entries ?? []);
  }, [directories]);

  const rootState = directories[ROOT_DIRECTORY_KEY];

  return {
    files,
    loading: Boolean(rootState?.loading && !rootState.loaded),
    error: rootState?.error ?? null,
    refreshFiles,
    refreshKey,
    loadDirectory,
    loadMoreEntries,
    getDirectoryStatus,
    showAllFiles,
    setShowAllFiles,
  };
}
