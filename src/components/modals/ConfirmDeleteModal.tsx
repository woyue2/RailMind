import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  recordText?: string;
  hasChildren?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  recordText,
  hasChildren,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs bg-white rounded-2xl shadow-2xl p-5 border border-gray-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Icon Badge */}
        <div className="w-11 h-11 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-3.5 ring-8 ring-red-50/50">
          <AlertTriangle className="w-5 h-5" />
        </div>

        {/* Title & Description */}
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          确定要删除这条记录吗？
        </h3>

        {recordText && (
          <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-lg w-full mb-3 break-words line-clamp-3 text-left font-normal border border-gray-100">
            "{recordText}"
          </p>
        )}

        {hasChildren && (
          <p className="text-[11.5px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md mb-3 font-medium">
            ⚠️ 注意：该记录下的所有分支子记录也将一并被删除。
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full mt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-2 px-3 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-2xs shadow-red-200"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
};
