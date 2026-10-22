import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type WorkspaceLockType = "password" | "pin" | "pattern";

type CredentialInputProps = {
  type: WorkspaceLockType;
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

export function validateWorkspaceCredential(type: WorkspaceLockType, value: string): string | null {
  if (type === "pin") return /^\d{4}$/.test(value) ? null : "الرمز السري يجب أن يتكوّن من ٤ أرقام بالضبط.";
  if (type === "pattern") {
    const nodes = value.split("-").filter(Boolean);
    if (nodes.length < 4) return "ارسم نمطاً باستخدام ٤ نقاط على الأقل.";
    if (nodes.some((node) => !/^[0-8]$/.test(node)) || new Set(nodes).size !== nodes.length) return "النمط غير صالح. ارسمه من جديد.";
    return null;
  }
  if (value.trim().length < 4) return "كلمة المرور يجب أن تكون ٤ محارف على الأقل.";
  if (value.length > 128) return "كلمة المرور طويلة جداً.";
  return null;
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
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Older WebViews may not support pointer capture. */ }
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
    } catch { /* Pointer capture is optional. */ }
    onChange(selectedRef.current.join("-"));
  };

  const clear = () => {
    drawingRef.current = false;
    setNodes([]);
    onChange("");
  };

  const points = selected.map((node) => patternPoints[node]).filter(Boolean);
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
          return <g key={point.id}>
            {order >= 0 && <circle className="pattern-lock-selection" cx={point.x} cy={point.y} r="20" />}
            <circle className={"pattern-lock-dot " + (order >= 0 ? "selected" : "")} cx={point.x} cy={point.y} r="9" />
            {order >= 0 && <text className="pattern-lock-order" x={point.x} y={point.y + 4}>{order + 1}</text>}
          </g>;
        })}
      </svg>
      <div className="pattern-lock-footer">
        <span>{selected.length ? selected.length + " نقاط محددة" : "اسحب للوصل بين ٤ نقاط على الأقل"}</span>
        <button type="button" onClick={clear}>مسح النمط</button>
      </div>
    </div>
  );
}

export function WorkspaceLockInput({ type, value, onChange, label, autoFocus }: CredentialInputProps) {
  if (type === "pattern") return <PatternLockPad value={value} onChange={onChange} label={label} />;

  return (
    <label className="app-lock-input-label">
      <span>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(type === "pin" ? event.target.value.replace(/\D/g, "").slice(0, 4) : event.target.value)}
        placeholder={type === "pin" ? "••••" : "اكتب كلمة المرور"}
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
