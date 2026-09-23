import React, { useEffect, useRef, useState } from 'react';
import type { ChartData, ChartRef } from '../shared/charts.js';
import { api } from './api.js';

export function ChartsSettings() {
  const [enabled, setEnabled] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void api<{ enabled: boolean }>('/plugins/charts')
      .then((value) => {
        if (live) {
          setEnabled(value.enabled);
          setLoaded(true);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="plugin-card">
      <h2>Charts</h2>
      <p className="muted">Built-in plugin · Saved SQL results · Local rendering</p>
      <label className="checkbox">
        <input
          aria-label="Enable Charts system-wide"
          type="checkbox"
          disabled={!loaded || busy}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable Charts system-wide
      </label>
      <p>
        Enable it per project, then ask for a bar, line, pie/donut, or scatter chart. Charts are
        created on request, never automatically after a query. Existing charts remain readable when
        the plugin is disabled.
      </p>
      <button
        disabled={!loaded || busy}
        onClick={async () => {
          setBusy(true);
          setNotice('');
          setError('');
          try {
            await api('/plugins/charts', 'PUT', { enabled });
            setNotice('Charts settings saved.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save Charts settings
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
const palette = [
  '#32836b',
  '#538bc3',
  '#bb7531',
  '#9565b8',
  '#cc637a',
  '#538d96',
  '#869640',
  '#aa785d',
];
const compact = (value: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
const short = (value: unknown, n = 14) => {
  const text = String(value ?? 'NULL');
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
};
const color = (i: number) => palette[i % palette.length];

const Plot = React.memo(function Plot({
  chart,
  hidden,
  dark,
  svgRef,
  onToggle,
}: {
  chart: ChartData;
  hidden: number[];
  dark: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onToggle: (index: number) => void;
}) {
  const [hover, setHover] = useState('');
  const ink = dark ? '#eceeea' : '#252724',
    grid = dark ? '#444a46' : '#e4e5e1',
    background = dark ? '#202221' : '#ffffff';
  const left = 76,
    right = 694,
    top = 48,
    bottom = 318;
  const series = chart.y.map((_, i) => i).filter((i) => !hidden.includes(i));
  const values = chart.rows.flatMap((row) =>
    series.map((i) => row[i + 1]).filter((v): v is number => typeof v === 'number'),
  );
  let low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  if (low === high) high = low + 1;
  const y = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);
  const xValues = chart.rows.map((row) => row[0]).filter((v): v is number => typeof v === 'number');
  let xLow = Math.min(...xValues),
    xHigh = Math.max(...xValues);
  if (!Number.isFinite(xLow)) {
    xLow = 0;
    xHigh = 1;
  }
  if (xLow === xHigh) {
    const pad = Math.max(1, Math.abs(xLow) * 0.05);
    xLow -= pad;
    xHigh += pad;
  }
  const x = (row: (string | number | null)[], i: number) =>
    chart.kind === 'scatter'
      ? left + ((Number(row[0]) - xLow) / (xHigh - xLow)) * (right - left)
      : left + ((i + 0.5) / chart.rows.length) * (right - left);
  const point = (label: string) => ({
    tabIndex: 0,
    'aria-label': label,
    onMouseEnter: () => setHover(label),
    onMouseLeave: () => setHover(''),
    onFocus: () => setHover(label),
    onBlur: () => setHover(''),
  });
  const pieRows = chart.rows.map((row, i) => ({ row, i })).filter(({ i }) => !hidden.includes(i));
  const total = pieRows.reduce((sum, { row }) => sum + Number(row[1]), 0);
  const legend = chart.kind === 'pie' ? chart.rows.map((row) => String(row[0])) : chart.y;
  const footer = 390 + Math.ceil(legend.length / 4) * 22;
  const height = footer + 48;
  let angle = -Math.PI / 2;
  return (
    <div className="chart-plot">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 740 ${height}`}
        role="group"
        aria-label={`${chart.title} (${chart.kind} chart)`}
        fontFamily="Arial, sans-serif"
        fontSize="12"
      >
        <title>{chart.title}</title>
        <rect width="740" height={height} fill={background} />
        <text x="24" y="25" fill={ink} fontSize="15" fontWeight="600">
          {short(chart.title, 70)}
        </text>
        {chart.kind === 'pie' ? (
          <>
            {total <= 0 && (
              <text x="370" y="195" textAnchor="middle" fill={ink}>
                No visible values
              </text>
            )}
            {pieRows.map(({ row, i }) => {
              const amount = Number(row[1]),
                sweep = total > 0 ? (amount / total) * Math.PI * 2 : 0;
              const start = angle;
              angle += sweep;
              if (!sweep) return null;
              const cx = 370,
                cy = 202,
                r = 143;
              const label = `${row[0]}: ${String(amount)} (${((amount / total) * 100).toFixed(1)}%)`;
              if (sweep >= Math.PI * 2 - 1e-10)
                return (
                  <circle key={i} cx={cx} cy={cy} r={r} fill={color(i)} {...point(label)}>
                    <title>{label}</title>
                  </circle>
                );
              const startX = cx + r * Math.cos(start),
                startY = cy + r * Math.sin(start);
              const endX = cx + r * Math.cos(angle),
                endY = cy + r * Math.sin(angle);
              return (
                <path
                  key={i}
                  d={`M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`}
                  fill={color(i)}
                  stroke={background}
                  strokeWidth="1"
                  {...point(label)}
                >
                  <title>{label}</title>
                </path>
              );
            })}
            {chart.donut && (
              <circle cx="370" cy="202" r="78" fill={background} pointerEvents="none" />
            )}
          </>
        ) : (
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const value = low + ((high - low) * i) / 4;
              return (
                <g key={i}>
                  <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={grid} />
                  <text x={left - 10} y={y(value) + 4} textAnchor="end" fill={ink}>
                    {compact(value)}
                  </text>
                </g>
              );
            })}
            <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke={ink} />
            {chart.kind === 'scatter'
              ? [0, 1, 2, 3, 4].map((i) => (
                  <text
                    key={i}
                    x={left + ((right - left) * i) / 4}
                    y={bottom + 22}
                    textAnchor="middle"
                    fill={ink}
                  >
                    {compact(xLow + ((xHigh - xLow) * i) / 4)}
                  </text>
                ))
              : chart.rows.map(
                  (row, i) =>
                    i % Math.max(1, Math.ceil(chart.rows.length / 7)) === 0 && (
                      <text key={i} x={x(row, i)} y={bottom + 22} textAnchor="middle" fill={ink}>
                        {short(row[0])}
                      </text>
                    ),
                )}
            <text x="385" y="372" textAnchor="middle" fill={ink}>
              {short(chart.x, 65)}
            </text>
            {series.map((s, order) => {
              let pen = false;
              const line = chart.rows
                .map((row, i) => {
                  const value = row[s + 1];
                  if (value === null || row[0] === null) {
                    pen = false;
                    return '';
                  }
                  const command = `${pen ? 'L' : 'M'} ${x(row, i)} ${y(Number(value))}`;
                  pen = true;
                  return command;
                })
                .join(' ');
              return (
                <g key={s}>
                  {chart.kind === 'line' && (
                    <path d={line} fill="none" stroke={color(s)} strokeWidth="2" />
                  )}
                  {chart.rows.map((row, i) => {
                    const value = row[s + 1];
                    if (value === null || row[0] === null) return null;
                    const label = `${chart.x}: ${row[0]} · ${chart.y[s]}: ${String(value)}`;
                    const groupWidth = ((right - left) / chart.rows.length) * 0.8,
                      width = groupWidth / Math.max(1, series.length);
                    return chart.kind === 'bar' ? (
                      <rect
                        key={i}
                        x={x(row, i) - groupWidth / 2 + order * width}
                        y={Math.min(y(0), y(Number(value)))}
                        width={width * 0.92}
                        height={Math.abs(y(Number(value)) - y(0))}
                        fill={color(s)}
                        {...point(label)}
                      >
                        <title>{label}</title>
                      </rect>
                    ) : (
                      <circle
                        key={i}
                        cx={x(row, i)}
                        cy={y(Number(value))}
                        r={chart.kind === 'scatter' ? 4 : 3}
                        fill={color(s)}
                        {...point(label)}
                      >
                        <title>{label}</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}
          </>
        )}
        {legend.map((label, i) => (
          <g
            key={i}
            opacity={hidden.includes(i) ? 0.4 : 1}
            role="button"
            tabIndex={0}
            aria-label={`Toggle ${label}`}
            aria-pressed={!hidden.includes(i)}
            onClick={() => onToggle(i)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle(i);
              }
            }}
          >
            <title>{label}</title>
            <rect
              x={20 + (i % 4) * 178}
              y={384 + Math.floor(i / 4) * 22}
              width="176"
              height="22"
              fill={background}
            />
            <circle
              cx={28 + (i % 4) * 178}
              cy={396 + Math.floor(i / 4) * 22}
              r="4"
              fill={color(i)}
            />
            <text
              x={38 + (i % 4) * 178}
              y={400 + Math.floor(i / 4) * 22}
              fill={ink}
              textDecoration={hidden.includes(i) ? 'line-through' : undefined}
            >
              {short(label, 22)}
            </text>
          </g>
        ))}
        <text x="24" y={footer + 22} fill={ink} fontSize="11">
          {short(
            `SQL snapshot · ${chart.database} · ${new Date(chart.sourceAt).toLocaleString()} · ${chart.rows.length} rows · Not live`,
            110,
          )}
        </text>
        {chart.truncated && (
          <text x="24" y={footer + 40} fill={ink} fontSize="11">
            Limited SQL result: returned rows only, not the complete query result.
          </text>
        )}
      </svg>
      <p className="chart-hover" aria-live="polite">
        {hover || 'Hover or focus a point to see its values.'}
      </p>
    </div>
  );
});

export const ChartCard = React.memo(
  function ChartCard({ reference, chatId }: { reference: ChartRef; chatId: string }) {
    const [chart, setChart] = useState<ChartData>(),
      [error, setError] = useState(''),
      [hidden, setHidden] = useState<number[]>([]),
      [expanded, setExpanded] = useState(false);
    const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
    const svg = useRef<SVGSVGElement>(null),
      dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
      let live = true;
      setChart(undefined);
      setError('');
      setHidden([]);
      void api<ChartData>(`/conversations/${chatId}/charts/${reference.id}`)
        .then((value) => live && setChart(value))
        .catch((e) => live && setError(e.message));
      return () => {
        live = false;
      };
    }, [chatId, reference.id]);
    useEffect(() => {
      const observer = new MutationObserver(() =>
        setDark(document.documentElement.dataset.theme === 'dark'),
      );
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (expanded) dialog.current?.showModal();
    }, [expanded]);
    const downloadPng = async () => {
      try {
        if (!svg.current) return;
        const source = new XMLSerializer().serializeToString(svg.current);
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1480;
        canvas.height = svg.current.viewBox.baseVal.height * 2;
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('Image export failed.'))),
            'image/png',
          ),
        );
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = `chart-${reference.id}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setError('Could not export this chart as PNG.');
      }
    };
    const toggle = (i: number) =>
      setHidden((current) =>
        current.includes(i) ? current.filter((v) => v !== i) : [...current, i],
      );
    return (
      <figure className="chart-card" aria-label={reference.title}>
        <figcaption>
          <strong>{reference.title}</strong>
          {chart && (
            <div className="chart-actions">
              <button onClick={() => setExpanded(true)}>Expand chart</button>
              <button onClick={() => void downloadPng()}>Download PNG</button>
              <a href={`/api/conversations/${chatId}/charts/${reference.id}?format=csv`}>
                Download chart CSV
              </a>
            </div>
          )}
        </figcaption>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!chart && !error && <p>Loading chart…</p>}
        {chart && (
          <>
            <Plot chart={chart} hidden={hidden} dark={dark} svgRef={svg} onToggle={toggle} />
            <p className="muted small">
              SQL snapshot · {chart.database} · {new Date(chart.sourceAt).toLocaleString()} ·{' '}
              {chart.rows.length} rows · Not live
            </p>
            {chart.notices.map((notice) => (
              <p className="chart-notice" key={notice}>
                {notice}
              </p>
            ))}
            <details>
              <summary>View chart data</summary>
              <div className="markdown-table">
                <table>
                  <thead>
                    <tr>
                      {[chart.x, ...chart.y].map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((value, j) => (
                          <td key={j}>{value === null ? 'NULL' : String(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {expanded && (
              <dialog
                ref={dialog}
                className="chart-dialog"
                aria-label="Expanded chart"
                onCancel={(e) => {
                  e.preventDefault();
                  setExpanded(false);
                }}
              >
                <button onClick={() => setExpanded(false)}>Close chart</button>
                <Plot chart={chart} hidden={hidden} dark={dark} onToggle={toggle} />
                {chart.notices.map((notice) => (
                  <p key={notice}>{notice}</p>
                ))}
              </dialog>
            )}
          </>
        )}
      </figure>
    );
  },
  (previous, next) =>
    previous.chatId === next.chatId && previous.reference.id === next.reference.id,
);
