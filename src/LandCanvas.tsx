import { useRef, useState } from 'react';
import { area, formatArea, Land, newId, round1, Zone, ZONE_TYPES, ZoneType } from './model';

export type Tool = 'select' | ZoneType;

interface Props {
  land: Land;
  zones: Zone[];
  tool: Tool;
  selectedId: string | null;
  snap: number;
  onSelect: (id: string | null) => void;
  /** 描き終わった新しい区画 */
  onCreate: (z: Zone) => void;
  /** 移動・リサイズの開始(履歴を積む) */
  onBeginChange: () => void;
  /** 移動・リサイズ中の更新(履歴は積まない) */
  onLiveChange: (z: Zone) => void;
  onEndChange: () => void;
}

type Drag =
  | { kind: 'draw'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; id: string; dx: number; dy: number; orig: Zone }
  | { kind: 'resize'; id: string; orig: Zone };

const GRID_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

function gridStep(land: Land): number {
  const span = Math.max(land.width, land.height);
  return GRID_STEPS.find((s) => span / s <= 20) ?? 1000;
}

export default function LandCanvas(props: Props) {
  const { land, zones, tool, selectedId, snap } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const span = Math.max(land.width, land.height);
  const pad = span * 0.07;
  const fs = span / 40; // 文字の大きさ(m 単位)
  const step = gridStep(land);

  const s = (v: number) => round1(Math.round(v / snap) * snap);
  const clampX = (v: number) => Math.min(land.width, Math.max(0, v));
  const clampY = (v: number) => Math.min(land.height, Math.max(0, v));

  function toLand(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = toLand(e);
    const target = e.target as Element;
    const zoneId = target.closest('[data-zone]')?.getAttribute('data-zone') ?? null;
    const isHandle = target.closest('[data-handle]') !== null;

    if (tool === 'select') {
      if (isHandle && selectedId) {
        const z = zones.find((q) => q.id === selectedId);
        if (!z) return;
        props.onBeginChange();
        setDrag({ kind: 'resize', id: z.id, orig: z });
      } else if (zoneId) {
        const z = zones.find((q) => q.id === zoneId)!;
        props.onSelect(zoneId);
        props.onBeginChange();
        setDrag({ kind: 'move', id: z.id, dx: p.x - z.x, dy: p.y - z.y, orig: z });
      } else {
        props.onSelect(null);
        return;
      }
    } else {
      const x = clampX(s(p.x));
      const y = clampY(s(p.y));
      setDrag({ kind: 'draw', sx: x, sy: y, cx: x, cy: y });
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = toLand(e);
    if (drag.kind === 'draw') {
      setDrag({ ...drag, cx: clampX(s(p.x)), cy: clampY(s(p.y)) });
    } else if (drag.kind === 'move') {
      const o = drag.orig;
      const x = Math.min(land.width - o.w, Math.max(0, s(p.x - drag.dx)));
      const y = Math.min(land.height - o.h, Math.max(0, s(p.y - drag.dy)));
      props.onLiveChange({ ...o, x, y });
    } else {
      const o = drag.orig;
      const w = Math.max(snap, clampX(s(p.x)) - o.x);
      const h = Math.max(snap, clampY(s(p.y)) - o.y);
      props.onLiveChange({ ...o, w, h });
    }
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.kind === 'draw') {
      const x = Math.min(drag.sx, drag.cx);
      const y = Math.min(drag.sy, drag.cy);
      const w = Math.abs(drag.cx - drag.sx);
      const h = Math.abs(drag.cy - drag.sy);
      if (w >= snap && h >= snap && tool !== 'select') {
        props.onCreate({ id: newId(), type: tool, name: '', x, y, w, h });
      }
    } else {
      props.onEndChange();
    }
    setDrag(null);
  }

  const gridLines: JSX.Element[] = [];
  for (let gx = step; gx < land.width; gx += step) {
    gridLines.push(<line key={`gx${gx}`} x1={gx} y1={0} x2={gx} y2={land.height} vectorEffect="non-scaling-stroke" />);
  }
  for (let gy = step; gy < land.height; gy += step) {
    gridLines.push(<line key={`gy${gy}`} x1={0} y1={gy} x2={land.width} y2={gy} vectorEffect="non-scaling-stroke" />);
  }

  const selected = zones.find((z) => z.id === selectedId) ?? null;
  const handleR = fs * 0.8;

  return (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${land.width + pad * 2} ${land.height + pad * 2}`}
      className="w-full h-full select-none"
      style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={`${land.name}の絵図 ${land.width}m × ${land.height}m`}
    >
      {/* 土地 */}
      <rect x={0} y={0} width={land.width} height={land.height} fill="#eef5e6" stroke="#5b6b4e" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <g stroke="#5b6b4e" strokeOpacity={0.18} strokeWidth={1} vectorEffect="non-scaling-stroke">
        {gridLines}
      </g>

      {/* 寸法 */}
      <g fill="#5b6b4e" fontSize={fs} fontFamily="system-ui, sans-serif">
        <text x={land.width / 2} y={-pad * 0.35} textAnchor="middle">
          {land.width} m
        </text>
        <text
          x={-pad * 0.35}
          y={land.height / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${-pad * 0.35} ${land.height / 2})`}
        >
          {land.height} m
        </text>
        <text x={land.width + pad * 0.5} y={-pad * 0.35} textAnchor="middle" fontWeight="bold">
          北↑
        </text>
        <text x={land.width} y={land.height + pad * 0.6} textAnchor="end" fillOpacity={0.7}>
          方眼 {step} m
        </text>
      </g>

      {/* 区画 */}
      {zones.map((z) => {
        const st = ZONE_TYPES[z.type];
        const isSel = z.id === selectedId;
        const showLabel = z.w >= fs * 3 && z.h >= fs * 2.4;
        return (
          <g key={z.id} data-zone={z.id} style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: 'move' }}>
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              fill={st.fill}
              fillOpacity={0.85}
              stroke={isSel ? '#1f2937' : st.stroke}
              strokeWidth={isSel ? 3 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
            {showLabel && (
              <g fontSize={fs * 0.9} fontFamily="system-ui, sans-serif" textAnchor="middle" fill="#1f2937" pointerEvents="none">
                <text x={z.x + z.w / 2} y={z.y + z.h / 2 - fs * 0.15}>
                  {z.name || st.label}
                </text>
                <text x={z.x + z.w / 2} y={z.y + z.h / 2 + fs * 0.95} fontSize={fs * 0.75} fillOpacity={0.7}>
                  {formatArea(area(z))}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* リサイズの取っ手 */}
      {selected && tool === 'select' && (
        <circle
          data-handle="se"
          cx={selected.x + selected.w}
          cy={selected.y + selected.h}
          r={handleR}
          fill="#fff"
          stroke="#1f2937"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'nwse-resize' }}
        />
      )}

      {/* 描いている途中の枠 */}
      {drag?.kind === 'draw' && tool !== 'select' && (
        <g pointerEvents="none">
          <rect
            x={Math.min(drag.sx, drag.cx)}
            y={Math.min(drag.sy, drag.cy)}
            width={Math.abs(drag.cx - drag.sx)}
            height={Math.abs(drag.cy - drag.sy)}
            fill={ZONE_TYPES[tool].fill}
            fillOpacity={0.6}
            stroke={ZONE_TYPES[tool].stroke}
            strokeDasharray="6 4"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={Math.max(drag.sx, drag.cx)}
            y={Math.max(drag.sy, drag.cy) + fs * 1.1}
            textAnchor="end"
            fontSize={fs}
            fontFamily="system-ui, sans-serif"
            fill="#1f2937"
          >
            {round1(Math.abs(drag.cx - drag.sx))} × {round1(Math.abs(drag.cy - drag.sy))} m
          </text>
        </g>
      )}
    </svg>
  );
}
