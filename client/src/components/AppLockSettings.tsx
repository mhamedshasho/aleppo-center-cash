import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check, Grid3X3, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  authenticateKey,
  getConfiguredAppLockType,
  setAppLockCredential,
  validateAppLockCredential,
  type AppLockType,
} from "@/lib/auth";

type CredentialInputProps = {
  type: AppLockType;
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
};

const patternPoints = [
  { id: 0, x: 50, y: 50 }, { id: 1, x: 150, y: 50 }, { id: 2, x: 250, y: 50 },
  { id: 3, x: 50, y: 150 }, { id: 4, x: 150, y: 150 }, { id: 5, x: 250, y: 150 },
  { id: 6, x: 50, y: 250 }, { id: 7, x: 150, y: 250 }, { id: 8, x: 250, y: 250 },
];

function parsePattern(value: string) {
  return value.split("-").filter(Boolean).map(Number).filter((node) => Number.isInteger(node) && node >= 0 && node <= 8);
}

export function PatternLockPad({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [selected, setSelected] = useState<number[]>(() => parsePattern(value));
  const selectedRef = useRef<number[]>(parsePattern(value));
  const drawingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!drawingRef.current) {
      const next = parsePattern(value);
      selectedRef.current = next;
      setSelected(next);
    }
  }, [value]);

  const setNodes = (nodes: number[]) => {
    selectedRef.current = nodes;
    setSelected(nodes);
  };

  const addNode = (node: number) => {
    const current = selectedRef.current;
    if (current.includes(node)) return;
    const next = [...current];
    const previous = current[current.length - 1];
    if (previous !== undefined) {
      const previousPoint = patternPoints[previous];
      const point = patternPoints[node];
      const deltaX = (point.x - previousPoint.x) / 100;
      const deltaY = (point.y - previousPoint.y) / 100;
      const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      if (steps === 2 && (deltaX === 0 || deltaY === 0 || Math.abs(deltaX) === Math.abs(deltaY))) {
        const middleX = (point.x + previousPoint.x) / 2;
        const middleY = (point.y + previousPoint.y) / 2;
        const middle = patternPoints.find((candidate) => candidate.x === middleX && candidate.y === middleY);
        if (middle && !next.includes(middle.id)) next.push(middle.id);
      }
    }
    next.push(node);
    setNodes(next);
  };

  const nearestNode = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((event.clientX - rect.left) / rect.width) * 300;
    const y = ((event.clientY - rect.top) / rect.height) * 300;
    let nearest: { id: number; distance: number } | null = null;
    for (const point of patternPoints) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= 38 && (!nearest || distance < nearest.distance)) nearest = { id: point.id, distance };
    }
    return nearest?.id ?? null;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const node = nearestNode(event);
    if (node === null) return;
    event.preventDefault();
    drawingRef.current = true;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Some older WebViews do not support pointer capture. */ }
    setNodes([node]);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const node = nearestNode(event);
    if (node !== null) addNode(node);
  };

  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const node = nearestNode(event);
    if (node !== null) addNode(node);
    drawingRef.current = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture is optional on older browser engines. */ }
    onChange(selectedRef.current.join("-"));
  };

  const points = selected.map((node) => patternPoints[node]).filter(Boolean);
  const clear = () => {
    drawingRef.current = false;
    setNodes([]);
    onChange("");
  };

  return (
    <div className="pattern-lock-field">
      <span className="pattern-lock-label">{label}</span>
      <svg
        ref={svgRef}
        className="pattern-lock-pad"
        viewBox="0 0 300 300"
        role="img"
        aria-label={label + ". اسحب إصبعك أو الفأرة بين النقاط لتكوين النمط."}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        {points.length > 1 && <polyline className="pattern-lock-line" points={points.map((point) => point.x + "," + point.y).join(" ")} />}
        {patternPoints.map((point) => {
          const order = selected.indexOf(point.id);
          return (
            <g key={point.id}>
              {order >= 0 && <circle className="pattern-lock-selection" cx={point.x} cy={point.y} r="20" />}
              <circle className={"pattern-lock-dot " + (order >= 0 ? "selected" : "")} cx={point.x} cy={point.y} r="9" />
              {order >= 0 && <text className="pattern-lock-order" x={point.x} y={point.y + 4}>{order + 1}</text>}
            </g>
          );
        })}
      </svg>
      <div className="pattern-lock-footer">
        <span>{selected.length ? selected.length + " نقاط محددة" : "اسحب للوصل بين ٤ نقاط على الأقل"}</span>
        <button type="button" onClick={clear}>مسح النمط</button>
      </div>
    </div>
  );
}

export function LockCredentialInput({ type, value, onChange, label, autoFocus }: CredentialInputProps) {
  if (type === "pattern") {
    return <PatternLockPad value={value} onChange={onChange} label={label} />;
  }

  return (
    <label className="app-lock-input-label">
      <span>{label}</span>
      <input
        type={type === "pin" ? "password" : "password"}
        value={value}
        onChange={(event) => onChange(type === "pin" ? event.target.value.replace(/\\D/g, "").slice(0, 4) : event.target.value)}
        placeholder={type === "pin" ? "••••" : type === "password" ? "اكتب كلمة المرور" : ""}
        inputMode={type === "pin" ? "numeric" : "text"}
        pattern={type === "pin" ? "[0-9]{4}" : undefined}
        maxLength={type === "pin" ? 4 : 128}
        autoComplete="off"
        autoFocus={autoFocus}
        dir={type === "pin" ? "ltr" : "auto"}
      />
      {type === "pin" && <small>٤ أرقام بالضبط</small>}
    </label>
  );
}

const lockOptions: { type: AppLockType; title: string; description: string; icon: typeof KeyRound }[] = [
  { type: "password", title: "كلمة مرور", description: "حروف وأرقام", icon: KeyRound },
  { type: "pin", title: "PIN من ٤ أرقام", description: "رمز رقمي سريع", icon: Grid3X3 },
  { type: "pattern", title: "نمط الشاشة", description: "ارسم نمطاً بين النقاط", icon: Smartphone },
];

export default function AppLockSettings({ onConfigured, onLockNow }: { onConfigured?: (type: AppLockType) => void; onLockNow?: () => void }) {
  const [currentType, setCurrentType] = useState<AppLockType | null>(() => getConfiguredAppLockType());
  const [targetType, setTargetType] = useState<AppLockType>(() => getConfiguredAppLockType() ?? "password");
  const [currentCredential, setCurrentCredential] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [confirmCredential, setConfirmCredential] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const type = getConfiguredAppLockType();
    setCurrentType(type);
    setTargetType(type ?? "password");
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (currentType) {
        if (!currentCredential) {
          toast.error("أدخل القفل الحالي أولاً للتأكد من هويتك.");
          return;
        }
        const currentResult = await authenticateKey(currentCredential);
        if (!currentResult.ok) {
          toast.error(currentResult.message);
          return;
        }
      }

      const validationMessage = validateAppLockCredential(targetType, newCredential);
      if (validationMessage) {
        toast.error(validationMessage);
        return;
      }
      if (newCredential !== confirmCredential) {
        toast.error(targetType === "pattern" ? "النمطان غير متطابقين. ارسم النمط نفسه مرتين." : "التأكيد غير مطابق للقفل الجديد.");
        return;
      }

      await setAppLockCredential(targetType, newCredential);
      setCurrentType(targetType);
      setTargetType(targetType);
      setCurrentCredential("");
      setNewCredential("");
      setConfirmCredential("");
      onConfigured?.(targetType);
      toast.success(currentType ? "تم تغيير قفل التطبيق على هذا الجهاز." : "تم تفعيل قفل التطبيق على هذا الجهاز.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ قفل التطبيق.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-lock-settings">
      <div className="app-lock-security-note">
        <div className="app-lock-security-icon"><ShieldCheck size={21} /></div>
        <div>
          <strong>{currentType ? "قفل التطبيق مفعّل" : "أضف قفلاً خاصاً بالتطبيق"}</strong>
          <span>
            {currentType
              ? "يمكنك تغيير كلمة المرور أو التحويل إلى PIN من ٤ أرقام أو نمط شاشة."
              : "القفل خاص بهذا الجهاز، ويظهر قبل فتح الحسابات بعد إعادة فتح التطبيق. لا يغيّر كلمة مرور حساب البريد."}
          </span>
        </div>
      </div>

      {currentType && (
        <div className="app-lock-current-badge">
          <LockKeyhole size={16} />
          القفل الحالي: {currentType === "password" ? "كلمة مرور" : currentType === "pin" ? "PIN من ٤ أرقام" : "نمط الشاشة"}
        </div>
      )}

      {currentType && (
        <div className="app-lock-credential-block">
          <LockCredentialInput type={currentType} value={currentCredential} onChange={setCurrentCredential} label="أدخل القفل الحالي للتأكيد" />
        </div>
      )}

      <div className="app-lock-option-heading">اختر طريقة القفل الجديدة</div>
      <div className="app-lock-options">
        {lockOptions.map(({ type, title, description, icon: Icon }) => (
          <button
            type="button"
            key={type}
            className={"app-lock-option " + (targetType === type ? "active" : "")}
            onClick={() => { setTargetType(type); setNewCredential(""); setConfirmCredential(""); }}
            aria-pressed={targetType === type}
          >
            <span className="app-lock-option-icon"><Icon size={19} /></span>
            <strong>{title}</strong>
            <small>{description}</small>
            {targetType === type && <Check className="app-lock-option-check" size={16} />}
          </button>
        ))}
      </div>

      <div className="app-lock-credential-grid">
        <LockCredentialInput key={"new-" + targetType} type={targetType} value={newCredential} onChange={setNewCredential} label="القفل الجديد" />
        <LockCredentialInput key={"confirm-" + targetType} type={targetType} value={confirmCredential} onChange={setConfirmCredential} label="أعد إدخال القفل للتأكيد" />
      </div>

      <button type="button" className="primary-btn full app-lock-save" onClick={() => void save()} disabled={busy}>
        {busy ? "جارٍ حفظ القفل…" : currentType ? "حفظ القفل الجديد" : "تفعيل القفل"}
        <Check size={17} />
      </button>
      {currentType && <button type="button" className="secondary-btn full app-lock-lock-now" onClick={onLockNow}><LockKeyhole size={16} /> قفل التطبيق الآن للتجربة</button>}
      <p className="app-lock-footnote">لأمان أفضل، لا تستخدم 1234 أو تاريخ ميلادك. يتم حفظ بصمة مشتقة من القفل، وليس القفل نفسه.</p>
    </div>
  );
}
