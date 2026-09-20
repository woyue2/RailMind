import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, ListTree, X } from 'lucide-react';
import { RecordItem } from '../../types';
import { useFlowStore } from '../../store/useFlowStore';
import { useSystemBack } from '../../hooks/useSystemBack';
import { buildValueProfile, VALUE_QUADRANTS } from '../../utils/valuePriority';

interface Props {
  isOpen: boolean;
  record: RecordItem | null;
  onClose: () => void;
}

type Answers = {
  isRoutine?: boolean;
  oneAction?: boolean;
  highValue?: boolean;
  highDelayLoss?: boolean;
  highLeverage?: boolean;
  unlocksWork?: boolean;
};

const emptyAnswers: Answers = {};

function Choice({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50">
      <span><span className="block text-sm font-semibold text-gray-900">{label}</span><span className="mt-0.5 block text-xs leading-5 text-gray-500">{detail}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
  );
}

export function ValuePriorityWizard({ isOpen, record, onClose }: Props) {
  const addRecords = useFlowStore((s) => s.addRecords);
  const updateRecord = useFlowStore((s) => s.updateRecord);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [subtasksText, setSubtasksText] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskIndex, setSubtaskIndex] = useState(0);
  const [subtaskAnswers, setSubtaskAnswers] = useState<Answers>(emptyAnswers);
  const [subtaskProfiles, setSubtaskProfiles] = useState<ReturnType<typeof buildValueProfile>[]>([]);

  useSystemBack(isOpen, onClose);
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setAnswers(emptyAnswers);
    setSubtasksText('');
    setSubtasks([]);
    setSubtaskIndex(0);
    setSubtaskAnswers(emptyAnswers);
    setSubtaskProfiles([]);
  }, [isOpen, record?.id]);

  const title = subtasks.length ? `判斷子任務 ${subtaskIndex + 1}/${subtasks.length}` : '新版四象限判斷';
  const activeAnswers = subtasks.length ? subtaskAnswers : answers;
  const setActiveAnswers = (next: Answers) => subtasks.length ? setSubtaskAnswers(next) : setAnswers(next);
  const question = useMemo(() => {
    if (step === 0) return { heading: '這是會重複發生的日常任務嗎？', note: '日常任務看長期累積後果；非日常任務看這一次的直接後果。' };
    if (step === 1) return { heading: '它能透過一次明確行動完成嗎？', note: '如果包含多個成果或步驟，先拆解後再判斷會更準確。' };
    if (step === 2) return activeAnswers.isRoutine
      ? { heading: '長期持續做，會產生明顯的正面累積嗎？', note: '例如健康、能力、關係或未來時間的累積。' }
      : { heading: '這一次完成，會產生明顯的直接價值嗎？', note: '不要用「感覺很急」代替價值判斷。' };
    if (step === 3) return { heading: '現在不做或晚做，會造成明顯損失嗎？', note: '考慮期限、機會流失、他人受阻或問題惡化。' };
    if (step === 4) return { heading: '完成後能節省未來時間或反覆產生收益嗎？', note: '這是槓桿，只影響同一象限內的先後順序。' };
    return { heading: '它是否正在阻塞或能解鎖其他工作？', note: '能解除阻塞的任務會排在象限最前面。' };
  }, [step, activeAnswers.isRoutine]);

  if (!isOpen || !record) return null;

  const finishAnswers = (next: Answers) => {
    const profile = buildValueProfile({
      is_routine: Boolean(next.isRoutine),
      high_value: Boolean(next.highValue),
      high_delay_loss: Boolean(next.highDelayLoss),
      high_leverage: Boolean(next.highLeverage),
      unlocks_work: Boolean(next.unlocksWork),
    });
    if (!subtasks.length) {
      updateRecord(record.id, { value_priority: profile });
      onClose();
      return;
    }
    if (subtaskIndex + 1 < subtasks.length) {
      setSubtaskProfiles((items) => [...items, profile]);
      setSubtaskIndex((value) => value + 1);
      setSubtaskAnswers(emptyAnswers);
      setStep(0);
    } else {
      const completedProfiles = [...subtaskProfiles, profile];
      // K10：一次性批量创建子任务分支，替代 N 次 addRecord（原实现会为每个子任务
      // 触发独立的 set + sync enqueue）。
      addRecords(
        subtasks.map((text, index) => ({
          text,
          options: {
            parent_id: record.id,
            thread_id: record.thread_id,
            value_priority: completedProfiles[index],
          },
        }))
      );
      updateRecord(record.id, {
        value_priority: { is_routine: Boolean(answers.isRoutine), is_container: true, reason: `已拆成 ${subtasks.length} 個可執行分支` },
      });
      onClose();
    }
  };

  const choose = (value: boolean) => {
    const next = { ...activeAnswers };
    if (step === 0) next.isRoutine = value;
    if (step === 1) next.oneAction = value;
    if (step === 2) next.highValue = value;
    if (step === 3) next.highDelayLoss = value;
    if (step === 4) next.highLeverage = value;
    if (step === 5) next.unlocksWork = value;
    setActiveAnswers(next);
    if (step === 1 && !value && !subtasks.length) {
      setAnswers(next);
      setStep(6);
    } else if (step === 5) {
      finishAnswers(next);
    } else {
      setStep((value) => value + 1);
    }
  };

  const createBreakdown = () => {
    const lines = subtasksText.split('\n').map((line) => line.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    setSubtasks(lines);
    setSubtaskIndex(0);
    setSubtaskAnswers(emptyAnswers);
    setSubtaskProfiles([]);
    setStep(0);
  };

  const previewProfile = step === 5 ? buildValueProfile({
    is_routine: Boolean(activeAnswers.isRoutine), high_value: Boolean(activeAnswers.highValue),
    high_delay_loss: Boolean(activeAnswers.highDelayLoss), high_leverage: Boolean(activeAnswers.highLeverage), unlocks_work: false,
  }) : null;
  const previewQuadrant = VALUE_QUADRANTS.find((item) => item.id === previewProfile?.quadrant);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-[#fafafa] p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {(step > 0 && step < 6) && <button type="button" onClick={() => setStep((value) => value - 1)} className="mt-0.5 rounded-full p-1 text-gray-500 hover:bg-gray-200"><ArrowLeft className="h-4 w-4" /></button>}
            <div className="min-w-0"><h3 className="text-base font-semibold text-gray-900">{title}</h3><p className="mt-1 truncate text-xs text-gray-500">{subtasks.length ? subtasks[subtaskIndex] : record.text}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-200" aria-label="關閉"><X className="h-5 w-5" /></button>
        </div>

        {step < 6 ? <>
          <div className="mb-4 flex gap-1">{Array.from({ length: 6 }).map((_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-violet-500' : 'bg-gray-200'}`} />)}</div>
          <h4 className="text-lg font-semibold leading-7 text-gray-900">{question.heading}</h4>
          <p className="mb-4 mt-1 text-xs leading-5 text-gray-500">{question.note}</p>
          {previewQuadrant && <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${previewQuadrant.tone}`}>目前判斷：{previewQuadrant.title} · {previewQuadrant.action}</div>}
          <div className="space-y-2">
            <Choice label="是" detail={step === 1 ? '這是一個明確、可直接執行的動作' : '符合上面的描述'} onClick={() => choose(true)} />
            <Choice label="否" detail={step === 1 ? '它包含多個成果或需要分成數步' : '不符合或影響很有限'} onClick={() => choose(false)} />
          </div>
        </> : <>
          <div className="mb-3 flex items-center gap-2 text-violet-700"><ListTree className="h-5 w-5" /><h4 className="font-semibold">先拆成可執行分支</h4></div>
          <p className="mb-3 text-xs leading-5 text-gray-500">每行寫一個能一次完成的動作。先寫會卡住後續的步驟，再寫其他成果；下一步會逐項判斷。</p>
          <textarea value={subtasksText} onChange={(event) => setSubtasksText(event.target.value)} rows={6} autoFocus placeholder={'例如：\n確認核心需求\n決定資料結構\n完成第一個可用版本'} className="w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          <button type="button" onClick={createBreakdown} disabled={!subtasksText.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"><Check className="h-4 w-4" />開始逐項判斷</button>
        </>}
      </div>
    </div>
  );
}
