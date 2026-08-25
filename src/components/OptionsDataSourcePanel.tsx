import React from 'react';
import { InfoIcon } from './Tooltip';

export interface OptionsDataSourcePanelProps {
  realOptionsLoaded?: boolean;
  loading?: boolean;
  message?: string;
  disabled?: boolean;
  disabledReason?: string;
  onLoadReal?: () => void;
  /** V29-UI-A: which local data packs are absent in this build. Rendered verbatim. */
  missingPacks?: string[];
}

/**
 * V29-UI-A defect #5: the previous version only claimed "离线可用 / 无需外部 API", which
 * reads as "everything is here". It never told the player WHICH local pack is missing,
 * that the build makes no network call, or that buying a subscription cannot conjure a
 * historical fact that was never captured. Those three statements are now permanent,
 * non-hover text so a phone player sees them too.
 */
const DEFAULT_MISSING_PACKS = [
  '历史期权链报价（每张合约的历史 bid/ask/IV）',
  '合约级成交回报（option trades / time & sales）',
  '历史未平仓量（open interest 时间序列）',
  '分析师评级与目标价',
  '公司基本面（P/E、EPS、公司简介）',
];

export function OptionsDataSourcePanel(props: OptionsDataSourcePanelProps): JSX.Element {
  const missing = props.missingPacks ?? DEFAULT_MISSING_PACKS;

  return (
    <div className="panel data-provenance-panel" data-testid="data-provenance-panel">
      <div className="title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>数据真实性分层 (Data Truth)</span>
        <InfoIcon
          title="5层数据真实性架构"
          content="游戏严格对所有数据进行来源标识，不使用伪装的假精度，保证投资逻辑与复盘的诚信。"
          subtext="REAL 真实历史 / DERIVED 公式推导 / ESTIMATED 报价估算 / HEURISTIC 做市商启发式 / SIMULATED 策略模拟"
        />
      </div>

      <div className="provenance-badges-list">
        <div className="provenance-item">
          <span className="badge real ot-badge">真实数据 (REAL)</span>
          <span className="provenance-desc">底层标的 OHLC 收盘价、成交量与宏观日历</span>
        </div>
        <div className="provenance-item">
          <span className="badge derived ot-badge">推导数据 (DERIVED)</span>
          <span className="provenance-desc">Black-Scholes 希腊字母 Greeks 与 IV Skew 偏斜</span>
        </div>
        <div className="provenance-item">
          <span className="badge estimated ot-badge">估算数据 (ESTIMATED)</span>
          <span className="provenance-desc">做市商 Bid/Ask 买卖价差与流动性摩擦模型</span>
        </div>
        <div className="provenance-item">
          <span className="badge simulated ot-badge">模拟推演 (SIMULATED)</span>
          <span className="provenance-desc">机构资金 Flow、Dealer Gamma 暴露与 AI 对手行为</span>
        </div>
      </div>

      {/* V29-UI-A: permanently visible honesty block. Not a tooltip -- phones have no hover. */}
      <div className="v28-data-boundary-note" data-testid="data-source-honesty">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>本构建缺少哪些数据包</div>
        <ul style={{ margin: '0 0 6px 0', paddingLeft: 18 }}>
          {missing.map((p) => (
            <li key={p}>
              {p} — <span className="font-mono">DATA_UNAVAILABLE</span>
            </li>
          ))}
        </ul>
        <div>
          <strong>不会联网</strong>：本游戏零服务器、全离线运行，不发出任何 HTTP 请求。上面这些字段不是「加载失败」，
          而是随版本打包的本地数据里就没有采集过。
        </div>
        <div style={{ marginTop: 4 }}>
          <strong>订阅买不出历史</strong>：游戏内购买任何数据订阅或 AI Stack，只会改变对
          <em>已准入本地字段</em>的筛选、排序与展示容量，
          <strong>不会</strong>凭空生成一条从未被采集的历史事实。没有真实来源的字段会一直显示
          <span className="font-mono"> DATA_UNAVAILABLE</span>，而不是被填上一个看起来合理的数字。
        </div>
      </div>

      <div className="provenance-footer-note">
        <span className="badge-tag ot-badge derived">离线可用 <span className="en-secondary">OFFLINE READY</span></span>
        <span className="note-text">本地离线引擎驱动 · 无需配置任何外部金融 API</span>
      </div>
    </div>
  );
}
