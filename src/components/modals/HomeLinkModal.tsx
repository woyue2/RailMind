import { useEffect, useState } from 'react';
import { Link, X } from 'lucide-react';

interface HomeLinkModalProps {
  isOpen: boolean;
  initialValue: { shownName: string; href: string } | null;
  onClose: () => void;
  onConfirm: (value: { shownName: string; href: string } | null) => void;
}

export const HomeLinkModal = ({ isOpen, initialValue, onClose, onConfirm }: HomeLinkModalProps) => {
  const [shownName, setShownName] = useState('');
  const [href, setHref] = useState('');

  useEffect(() => {
    if (isOpen) {
      setShownName(initialValue?.shownName || '');
      setHref(initialValue?.href || '');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    const name = shownName.trim();
    const url = href.trim();
    if (!name || !url) return;
    onConfirm({ shownName: name, href: url });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <form onSubmit={confirm} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Link className="w-4 h-4 text-blue-600" /><h3 className="font-semibold text-gray-900">编辑主页链接</h3></div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-xs text-gray-500">按钮显示名称
          <input autoFocus value={shownName} onChange={(e) => setShownName(e.target.value)} placeholder="例如：我的博客" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="block text-xs text-gray-500">跳转地址（href）
          <textarea value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://example.com" rows={2} className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          {initialValue && <button type="button" onClick={() => onConfirm(null)} className="mr-auto px-3 py-2 text-xs text-red-600">删除链接</button>}
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-gray-500">取消</button>
          <button type="submit" disabled={!shownName.trim() || !href.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">确认</button>
        </div>
      </form>
    </div>
  );
};
