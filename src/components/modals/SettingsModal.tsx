import React, { useState, useEffect } from 'react';
import { Cloud, CheckCircle, AlertCircle, RefreshCw, X, Shield, HardDrive } from 'lucide-react';
import {
  loadR2Settings,
  saveR2Settings,
  isR2Configured,
  defaultR2Config,
} from '../../sync/credentials';
import { testR2Connection, triggerR2Sync } from '../../sync';
import { R2Config, SyncReport } from '../../sync/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<R2Config>(defaultR2Config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadR2Settings());
      setTestResult(null);
      setSyncReport(null);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveR2Settings(settings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleTest = async () => {
    // 先保存当前输入
    saveR2Settings(settings);
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testR2Connection();
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : '连接异常',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleManualSync = async () => {
    saveR2Settings(settings);
    setSyncing(true);
    setSyncReport(null);
    try {
      const report = await triggerR2Sync();
      setSyncReport(report);
    } catch (err) {
      setSyncReport({
        pulled: 0,
        pushed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4 transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">云端存储与同步设置</h3>
              <p className="text-[11px] text-gray-400">Cloudflare R2 直连备份与跨端同步</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Toggle Enable */}
          <div className="flex items-center justify-between p-3.5 bg-gray-50/80 rounded-xl border border-gray-100">
            <div>
              <div className="font-semibold text-gray-900 text-[13px]">启用 R2 云端同步</div>
              <div className="text-gray-400 text-[11px] mt-0.5">
                实时自动备份笔记、思维线与标签到您的私有 R2 存储桶
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* R2 Credentials Form */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-gray-700 font-medium">
              <span>Cloudflare R2 凭据配置</span>
              <span className="text-[10.5px] text-gray-400 flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                本地加密签名，零中转
              </span>
            </div>

            <div>
              <label className="block text-gray-500 mb-1">Account ID (Cloudflare 账户 ID)</label>
              <input
                type="text"
                value={settings.accountId}
                onChange={(e) => setSettings({ ...settings, accountId: e.target.value })}
                placeholder="例如: a1b2c3d4e5f6..."
                className="w-full px-3 py-2 text-xs bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-1">R2 Bucket Name (存储桶名称)</label>
              <input
                type="text"
                value={settings.bucketName}
                onChange={(e) => setSettings({ ...settings, bucketName: e.target.value })}
                placeholder="例如: flow-backup"
                className="w-full px-3 py-2 text-xs bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-1">Access Key ID</label>
              <input
                type="text"
                value={settings.accessKeyId}
                onChange={(e) => setSettings({ ...settings, accessKeyId: e.target.value })}
                placeholder="R2 API Token Access Key ID"
                className="w-full px-3 py-2 text-xs bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-500 mb-1">Secret Access Key</label>
              <input
                type="password"
                value={settings.secretAccessKey}
                onChange={(e) => setSettings({ ...settings, secretAccessKey: e.target.value })}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full px-3 py-2 text-xs bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-1">自定义 Endpoint（可选，留空则自动根据 Account ID 生成）</label>
              <input
                type="text"
                value={settings.endpoint || ''}
                onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
                placeholder="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
                className="w-full px-3 py-2 text-xs bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono text-gray-500"
              />
            </div>
          </div>

          {/* Test & Sync Actions Bar */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
              <span>{testing ? '测试中...' : '测试连接'}</span>
            </button>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing || !isR2Configured()}
              className="px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{syncing ? '同步中...' : '立即同步'}</span>
            </button>

            <button
              type="submit"
              className="ml-auto px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors flex items-center gap-1"
            >
              {saveSuccess ? '已保存 ✓' : '保存设置'}
            </button>
          </div>

          {/* Test Feedback Notice */}
          {testResult && (
            <div
              className={`p-3 rounded-xl flex items-start gap-2 text-xs ${
                testResult.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                  : 'bg-red-50 text-red-800 border border-red-200/80'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{testResult.message}</span>
            </div>
          )}

          {/* Sync Report Notice */}
          {syncReport && (
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-200/80 space-y-1 text-xs text-gray-700">
              <div className="font-semibold text-gray-900 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>同步完成</span>
              </div>
              <div className="text-[11.5px] text-gray-500">
                拉取更新: <span className="font-medium text-gray-900">{syncReport.pulled}</span> 条 · 推送更新:{' '}
                <span className="font-medium text-gray-900">{syncReport.pushed}</span> 条
              </div>
              {syncReport.errors.length > 0 && (
                <div className="text-[11px] text-red-600 pt-1">
                  异常: {syncReport.errors.join('; ')}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
