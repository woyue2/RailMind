import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { RecordItem } from '../../types';
import { formatShortDateTime } from '../../utils/dateUtils';
import { useSystemBack } from '../../hooks/useSystemBack';

interface RecordSearchProps {
  records: RecordItem[];
  onSelect: (record: RecordItem) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const RecordSearch = ({ records, onSelect, mobileOpen, setMobileOpen }: RecordSearchProps) => {
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

  const matches = useMemo(() => {
    if (!trimmedQuery) return [];
    const term = trimmedQuery.toLocaleLowerCase();
    return records
      .filter((record) => record.text.toLocaleLowerCase().includes(term))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [records, trimmedQuery]);

  const closeSearch = () => {
    setListOpen(false);
    setMobileOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  useSystemBack(mobileOpen || listOpen, () => {
    if (mobileOpen) closeSearch();
    else setListOpen(false);
  });

  useEffect(() => {
    if (!mobileOpen) return;
    inputRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!listOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [listOpen]);

  const showList = listOpen && !!trimmedQuery;

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 justify-center md:mx-4">
      {!mobileOpen && (
        <button type="button" onClick={() => setMobileOpen(true)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 md:hidden"
          aria-label="搜索记录正文" title="搜索记录正文">
          <Search className="h-4 w-4" />
        </button>
      )}
      <div className={`${mobileOpen ? 'flex' : 'hidden'} min-w-0 w-full items-center gap-2 md:flex`}>
        {mobileOpen && (
          <button type="button" onClick={closeSearch} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 md:hidden" aria-label="关闭搜索">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 focus-within:border-blue-300 focus-within:bg-white">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input ref={inputRef} type="search" value={query}
            onChange={(event) => { setQuery(event.target.value); setListOpen(!!event.target.value.trim()); }}
            onFocus={() => { if (trimmedQuery) setListOpen(true); }}
            onKeyDown={(event) => { if (event.key === 'Escape') { setListOpen(false); inputRef.current?.blur(); } }}
            placeholder="搜索我写的内容…" aria-label="搜索记录正文"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setListOpen(false); inputRef.current?.focus(); }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-700" aria-label="清空搜索">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showList && (
        <div role="listbox" aria-label="记录搜索结果"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(24rem,55dvh)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl md:left-0 md:right-0">
          <div className="px-2 py-1.5 text-[11px] text-gray-500">搜索结果 · {matches.length} 条</div>
          {matches.length ? matches.map((record) => (
            <button key={record.id} type="button" role="option" aria-selected={false}
              onClick={() => { closeSearch(); onSelect(record); }}
              className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-blue-50 focus:bg-blue-50">
              <span className="block text-[11px] text-gray-400">{formatShortDateTime(record.created_at)}</span>
              <span className="mt-0.5 block line-clamp-2 text-sm text-gray-800">{record.text}</span>
            </button>
          )) : <p className="px-2.5 py-5 text-center text-sm text-gray-500">没有找到相关记录</p>}
        </div>
      )}
    </div>
  );
};
