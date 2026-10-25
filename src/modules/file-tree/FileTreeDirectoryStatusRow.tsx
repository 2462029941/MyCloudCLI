import { AlertTriangle, ChevronsDown, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import type { FileTreeDirectoryStatus } from '@/shared/types';

type FileTreeDirectoryStatusRowProps = {
  status: FileTreeDirectoryStatus;
  /** Indentation level of the folder's children. */
  level: number;
  /** Whether the folder has no entries to show once loaded. */
  isEmpty: boolean;
  onLoadMore?: () => void;
};

const rowClassName = 'flex items-center gap-1.5 py-[3px] pr-2 text-xs text-muted-foreground';

/**
 * Rendered by FileTreeList (project root) and FileTreeNode (open folders)
 * below a folder's entries: a loading line, an error with retry, a "load more"
 * button for the next page, or an empty-folder note. Renders nothing when the
 * folder is fully loaded and has entries.
 */
export default function FileTreeDirectoryStatusRow({
  status,
  level,
  isEmpty,
  onLoadMore,
}: FileTreeDirectoryStatusRowProps) {
  const { t } = useTranslation();
  const style = { paddingLeft: `${level * 16 + 22}px` };

  if (status.loading) {
    return (
      <div className={rowClassName} style={style}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{t('fileTree.loadingEntries', 'Loading…')}</span>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className={cn(rowClassName, 'text-destructive')} style={style}>
        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
        <span className="truncate" title={status.error}>{status.error}</span>
        {onLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            className="ml-1 flex-shrink-0 underline-offset-2 hover:underline"
          >
            {t('fileTree.retry', 'Retry')}
          </button>
        )}
      </div>
    );
  }

  if (status.remainingEntries > 0 && onLoadMore) {
    return (
      <button
        type="button"
        onClick={onLoadMore}
        className={cn(rowClassName, 'w-full rounded-sm hover:bg-accent/60 hover:text-foreground')}
        style={style}
      >
        <ChevronsDown className="h-3 w-3" />
        <span>
          {t('fileTree.loadMoreEntries', 'Load more ({{count}} remaining)', {
            count: status.remainingEntries,
          })}
        </span>
      </button>
    );
  }

  if (status.loaded && isEmpty) {
    return (
      <div className={cn(rowClassName, 'italic')} style={style}>
        {t('fileTree.emptyFolder', 'Empty folder')}
      </div>
    );
  }

  return null;
}
