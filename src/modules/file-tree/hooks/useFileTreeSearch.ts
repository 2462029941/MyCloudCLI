import { useEffect, useMemo, useState } from 'react';

import { api } from '@/shared/api';
import { collectExpandedDirectoryPaths, filterFileTree } from '@/modules/file-tree/utils/fileTreeUtils';
import type { FileTreeNode } from '@/shared/types';

type UseFileTreeSearchArgs = {
  projectId: string | null;
  /** The folders loaded so far; searched when the whole project cannot be indexed. */
  files: FileTreeNode[];
  /** Changes on every tree refresh so the project index is rebuilt with it. */
  refreshToken: unknown;
  expandDirectories: (paths: string[]) => void;
};

/**
 * What a search covers: the whole project, or only the folders loaded so far
 * when the project is too large for the server to index in one walk.
 */
type FileTreeSearchScope = 'project' | 'loaded';

type UseFileTreeSearchResult = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredFiles: FileTreeNode[];
  searchScope: FileTreeSearchScope;
};

type SearchIndex = {
  projectId: string;
  refreshToken: unknown;
  // `null` when the server refused to index the project (too many entries).
  tree: FileTreeNode[] | null;
};

export function useFileTreeSearch({
  projectId,
  files,
  refreshToken,
  expandDirectories,
}: UseFileTreeSearchArgs): UseFileTreeSearchResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const isSearching = Boolean(searchQuery.trim());
  const hasCurrentIndex = searchIndex?.projectId === projectId && searchIndex.refreshToken === refreshToken;

  // The tree itself is loaded folder by folder, so a search would otherwise
  // only see folders the user has opened. The first query fetches the
  // project-wide listing once; it stays until the next refresh.
  useEffect(() => {
    if (!isSearching || !projectId || hasCurrentIndex) {
      return;
    }

    const controller = new AbortController();
    api.getFiles(projectId, { signal: controller.signal })
      .then(async (response) => {
        const tree = response.ok ? (await response.json()) as FileTreeNode[] : null;
        setSearchIndex({ projectId, refreshToken, tree });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        console.error('Error indexing project files for search:', error);
        setSearchIndex({ projectId, refreshToken, tree: null });
      });

    return () => {
      controller.abort();
    };
  }, [hasCurrentIndex, isSearching, projectId, refreshToken]);

  const indexedTree = hasCurrentIndex ? searchIndex.tree : null;
  const searchScope: FileTreeSearchScope = indexedTree ? 'project' : 'loaded';

  // Derived, not stored: mirroring the filter into state made every keystroke
  // (and every tree refresh) cost an extra render, and left `filteredFiles` one
  // render behind `files`.
  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? filterFileTree(indexedTree ?? files, query) : files;
  }, [files, indexedTree, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }
    // Keep search results visible by opening every matching ancestor directory once per query update.
    expandDirectories(collectExpandedDirectoryPaths(filteredFiles));
  }, [expandDirectories, filteredFiles, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredFiles,
    searchScope,
  };
}
