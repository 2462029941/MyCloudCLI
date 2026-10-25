import type { DragEvent, ReactNode, RefObject } from 'react';

import type { FileTreeDirectoryStatus, FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '@/shared/types';
import FileTreeDirectoryStatusRow from '@/modules/file-tree/FileTreeDirectoryStatusRow';
import FileTreeNode from '@/modules/file-tree/FileTreeNode';

type FileTreeListProps = {
  items: FileTreeNodeType[];
  viewMode: FileTreeViewMode;
  expandedDirs: Set<string>;
  // Lazy-loading state per folder; omitted while searching.
  getDirectoryStatus?: (directoryPath: string) => FileTreeDirectoryStatus | null;
  rootDirectoryKey: string;
  onLoadMoreEntries?: (directoryPath: string) => void;
  onItemClick: (item: FileTreeNodeType) => void;
  renderFileIcon: (filename: string) => ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (date?: string) => string;
  onRename?: (item: FileTreeNodeType) => void;
  onDelete?: (item: FileTreeNodeType) => void;
  onNewFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onCopyPath?: (item: FileTreeNodeType) => void;
  onDownload?: (item: FileTreeNodeType) => void;
  onUpload?: (path: string) => void;
  onRefresh?: () => void;
  // Drag-and-drop upload targeting
  dropTarget?: string | null;
  onItemDragOver?: (event: DragEvent<HTMLDivElement>, targetPath: string) => void;
  // Rename state for inline editing
  renamingItem?: FileTreeNodeType | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
};

/** Rendered by FileTreeBody to lay out the tree rows for the active view mode. */
export default function FileTreeList({
  items,
  viewMode,
  expandedDirs,
  getDirectoryStatus,
  rootDirectoryKey,
  onLoadMoreEntries,
  onItemClick,
  renderFileIcon,
  formatFileSize,
  formatRelativeTime,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onDownload,
  onUpload,
  onRefresh,
  dropTarget,
  onItemDragOver,
  renamingItem,
  renameValue,
  setRenameValue,
  handleConfirmRename,
  handleCancelRename,
  renameInputRef,
  operationLoading,
}: FileTreeListProps) {
  // The root's first page is the tree itself; only its later pages need a row.
  const rootStatus = getDirectoryStatus?.(rootDirectoryKey);

  return (
    <div>
      {items.map((item) => (
        <FileTreeNode
          key={item.path}
          item={item}
          level={0}
          viewMode={viewMode}
          expandedDirs={expandedDirs}
          getDirectoryStatus={getDirectoryStatus}
          onLoadMoreEntries={onLoadMoreEntries}
          onItemClick={onItemClick}
          renderFileIcon={renderFileIcon}
          formatFileSize={formatFileSize}
          formatRelativeTime={formatRelativeTime}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onCopyPath={onCopyPath}
          onDownload={onDownload}
          onUpload={onUpload}
          onRefresh={onRefresh}
          dropTarget={dropTarget}
          onItemDragOver={onItemDragOver}
          renamingItem={renamingItem}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          handleConfirmRename={handleConfirmRename}
          handleCancelRename={handleCancelRename}
          renameInputRef={renameInputRef}
          operationLoading={operationLoading}
        />
      ))}
      {rootStatus && (
        <FileTreeDirectoryStatusRow
          status={rootStatus}
          level={-1}
          isEmpty={false}
          onLoadMore={onLoadMoreEntries ? () => onLoadMoreEntries(rootDirectoryKey) : undefined}
        />
      )}
    </div>
  );
}
