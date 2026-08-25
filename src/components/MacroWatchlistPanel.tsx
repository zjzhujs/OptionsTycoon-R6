import { money, fmt } from '../lib/format';
import { Sparkline } from './fx/MiniViz';

export type ChangeClass = 'green' | 'red' | '';
export type RegimeClass = 'green' | 'yellow' | 'red';

export interface MacroWatchlistPanelProps {
  mainLabel: string;
  mainValue: number;
  mainChangeText: string;
  mainChangeClass: ChangeClass;
  secondaryLabel: string;
  secondaryValue: number;
  secondaryChangeText: string;
  secondaryChangeClass: ChangeClass;
  vix: number | null;
  vixRange: string;
  regimeLabel: string;
  regimeClass: RegimeClass;
  /**
   * 三条迷你趋势线的数据（2026-08-19 claude）
   *
   * 评审点名这一块「4 个数字砖仍然很像普通 Dashboard」。加趋势线是最直接的补法。
   *
   * **必须由调用方切好"只到当前游戏日"再传进来**：这里画的是历史收盘价，
   * 多传一天就是把还没发生的行情摆在玩家面前。组件不做这个裁剪，
   * 因为它不知道今天是哪天——防前视的责任留在拿得到 dayIndex 的那一层。
   *
   * 传 undefined / 点数不足时 Sparkline 自己走空态，不会硬画。
   */
  mainSeries?: number[];
  secondarySeries?: number[];
  vixSeries?: number[];
}

function getDeltaClass(changeClass: ChangeClass): string {
  if (changeClass === 'green') return 'ot-metric-delta-up';
  if (changeClass === 'red') return 'ot-metric-delta-down';
  return 'ot-metric-delta-neutral';
}

function getRegimeBadgeClass(regimeClass: RegimeClass): string {
  if (regimeClass === 'green') return 'ot-badge-real';
  if (regimeClass === 'yellow') return 'ot-badge-estimated';
  return 'ot-badge-risk';
}

export function MacroWatchlistPanel(props: MacroWatchlistPanelProps): JSX.Element {
  const {
    mainLabel,
    mainValue,
    mainChangeText,
    mainChangeClass,
    secondaryLabel,
    secondaryValue,
    secondaryChangeText,
    secondaryChangeClass,
    vix,
    vixRange,
    regimeLabel,
    regimeClass,
    mainSeries,
    secondarySeries,
    vixSeries,
  } = props;

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        标的与宏观仪表 <span className="en-secondary">MACRO WATCHLIST</span>
      </div>

      <div className="split">
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">{mainLabel}</div>
          <div className="v ot-metric-value font-mono">{money(mainValue)}</div>
          <div className={`small font-mono ${getDeltaClass(mainChangeClass)}`}>{mainChangeText}</div>
          <Sparkline
            source="underlyingClose"
            points={mainSeries}
            width={104}
            height={26}
            color={mainChangeClass === 'red' ? 'var(--thm-risk)' : 'var(--thm-good)'}
          />
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">{secondaryLabel}</div>
          <div className="v ot-metric-value font-mono">{money(secondaryValue)}</div>
          <div className={`small font-mono ${getDeltaClass(secondaryChangeClass)}`}>{secondaryChangeText}</div>
          <Sparkline
            source="secondaryClose"
            points={secondarySeries}
            width={104}
            height={26}
            color={secondaryChangeClass === 'red' ? 'var(--thm-risk)' : 'var(--thm-good)'}
          />
        </div>
      </div>

      <div className="split" style={{ marginTop: 8 }}>
        <div className={`kpi ot-metric vix-breathe ${vix != null && vix >= 25 ? 'vix-breathe-hot' : ''}`}>
          <div className="k ot-metric-label">VIX · Cboe</div>
          <div className="v ot-metric-value font-mono">{vix === null ? '—' : fmt(vix)}</div>
          <div className="small font-mono ot-dim-text">{vixRange}</div>
          {/* VIX 用 gold：它不是"涨好跌坏"，是恐慌程度，套涨跌色会误导 */}
          <Sparkline source="vixClose" points={vixSeries} width={104} height={26} color="var(--thm-gold)" />
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">市场状态</div>
          <div className="regime-tag-wrap" style={{ marginTop: 4 }}>
            <span className={`ot-badge ${getRegimeBadgeClass(regimeClass)}`}>{regimeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
