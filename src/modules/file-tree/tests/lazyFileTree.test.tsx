import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import type { Project } from '@/shared/types';

/**
 * The tree loads one folder per request and one page at a time, so a project
 * of any size opens. These drive the real FileTree against a fake children
 * endpoint and assert which requests it makes.
 */

const ROOT = '/srv/huge-project';
const LARGE_DIRECTORY = `${ROOT}/logs`;
const LARGE_DIRECTORY_SIZE = 450;

type DirectoryRequest = { path: string | null; offset: number; limit: number; showAll: boolean };

const requests: DirectoryRequest[] = [];
let projectIndexStatus = 413;

const entriesFor = (directoryPath: string, showAll: boolean) => {
  if (directoryPath === ROOT) {
    return [
      { type: 'directory', name: 'logs', path: LARGE_DIRECTORY },
      ...(showAll ? [{ type: 'directory', name: 'node_modules', path: `${ROOT}/node_modules` }] : []),
      { type: 'file', name: 'README.md', path: `${ROOT}/README.md` },
    ];
  }
  if (directoryPath === LARGE_DIRECTORY) {
    return Array.from({ length: LARGE_DIRECTORY_SIZE }, (_, index) => ({
      type: 'file',
      name: `entry-${String(index).padStart(3, '0')}.log`,
      path: `${LARGE_DIRECTORY}/entry-${String(index).padStart(3, '0')}.log`,
    }));
  }
  return [];
};

vi.mock('@/shared/api', () => ({
  api: {
    getDirectoryEntries: async (_projectId: string, params: DirectoryRequest) => {
      requests.push(params);
      const directoryPath = params.path ?? ROOT;
      const allEntries = entriesFor(directoryPath, params.showAll);
      const entries = allEntries.slice(params.offset, params.offset + params.limit);
      const nextOffset = params.offset + entries.length;
      return {
        ok: true,
        json: async () => ({
          path: directoryPath,
          entries,
          offset: params.offset,
          nextOffset: nextOffset < allEntries.length ? nextOffset : null,
          totalEntries: allEntries.length,
          truncated: false,
        }),
      };
    },
    // The project-wide listing used for search; 413 is the server's
    // FILE_TREE_TOO_LARGE refusal.
    getFiles: async () => ({
      ok: projectIndexStatus === 200,
      status: projectIndexStatus,
      json: async () => [],
      text: async () => '{"error":"too large"}',
    }),
  },
}));

const { default: FileTree } = await import('@/modules/file-tree/FileTree');

const project: Project = { projectId: 'p1', displayName: 'huge', fullPath: ROOT, path: ROOT };

beforeEach(() => {
  requests.length = 0;
  projectIndexStatus = 413;
  localStorage.clear();
});

test('opening the tree reads only the project root', async () => {
  render(<FileTree selectedProject={project} />);

  await waitFor(() => assert.ok(screen.getByText('logs')));
  assert.deepEqual(requests.map((request) => request.path), [null]);
});

test('a folder is fetched when expanded, and a large one a page at a time', async () => {
  render(<FileTree selectedProject={project} />);
  await waitFor(() => assert.ok(screen.getByText('logs')));

  fireEvent.click(screen.getByText('logs'));
  await waitFor(() => assert.ok(screen.getByText('entry-000.log')));
  assert.deepEqual(requests.at(-1), { path: LARGE_DIRECTORY, offset: 0, limit: 200, showAll: false });
  assert.equal(screen.queryByText('entry-200.log'), null);

  fireEvent.click(await screen.findByText(/Load more \(250 remaining\)/));
  await waitFor(() => assert.ok(screen.getByText('entry-399.log')));
  assert.deepEqual(requests.at(-1), { path: LARGE_DIRECTORY, offset: 200, limit: 200, showAll: false });

  fireEvent.click(await screen.findByText(/Load more \(50 remaining\)/));
  await waitFor(() => assert.ok(screen.getByText('entry-449.log')));
  assert.equal(screen.queryByText(/Load more/), null);
});

test('the show-all switch reloads the tree with ignored folders included and is remembered', async () => {
  render(<FileTree selectedProject={project} />);
  await waitFor(() => assert.ok(screen.getByText('logs')));
  assert.equal(screen.queryByText('node_modules'), null);

  fireEvent.click(screen.getByRole('button', { name: 'Show all files' }));

  await waitFor(() => assert.ok(screen.getByText('node_modules')));
  assert.equal(requests.at(-1)?.showAll, true);
  assert.equal(localStorage.getItem('file-tree-show-all'), 'true');
});

test('search covers only opened folders, and says so, when the project is too large to index', async () => {
  render(<FileTree selectedProject={project} />);
  await waitFor(() => assert.ok(screen.getByText('logs')));

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'readme' } });

  await waitFor(() => assert.ok(screen.getByText(/only folders opened so far are searched/)));
  assert.ok(screen.getByText('README.md'));
});
