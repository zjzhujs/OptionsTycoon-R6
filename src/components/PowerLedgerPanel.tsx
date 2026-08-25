import React from 'react';
import type { GrudgeLedgerEntry } from '../engine/schemas';
import { ledgerSummary, type StandingWith } from '../engine/engines/grudge_ledger';

/**
 * 只声明本面板真正读取的那一个字段。schemas 与 types 各自有一个 GameState，
 * App 持有的是 types 那个；收最小结构可以让两边都直接传，不必 cast。
 */
export interface PowerLedgerPanelProps {
  state: { grudge_ledger?: GrudgeLedgerEntry[] };
  asOfDate: string;
}

/**
 * V30 · 权力面板 —— 恩怨账本。
 *
 * 存在的理由：这套机制如果只在引擎里跑，玩家永远不知道自己欠了谁、谁记着什么。
 * 「被背叛的实感」有一半来自于——你**早就看见**那笔账挂在那里，却没来得及还。
 *
 * 显示原则：不给抽象的好感度百分比，给具体的一句话。「Adrian Cross 记着你用律师函
 * 拦过他」比「Adrian 好感 -40」有用得多，因为前者你能想起当时为什么那么选。
 *
 * 边界：**合规/监管维度不在这里**。项目已有 evidence_state 与 12 阶段调查系统，
 * 由 CapitalPowerPanel 负责展示。这一屏只管人与人之间的账：谁欠谁、谁记谁的仇、
 * 谁手上握着谁的什么。两者互补而不重叠。
 */

const SUBJECT_NAMES: Record<string, string> = {
  maya_chen: 'Maya Chen · AI/半导体分析师',
  victor_hale: 'Victor Hale · 风控官',
  evelyn_shaw: 'Evelyn Shaw · 华尔街日报',
  daniel_ross: 'Daniel Ross · IR',
  marcus_reed: 'Marcus Reed',
  adrian_cross: 'Adrian Cross · Apex Horizon 创始人',
  leo_park: 'Leo Park · 交易执行',
  evelyn: 'Evelyn Shaw',
  jpmorgan_pb: 'JPMorgan · 主经纪商',
  goldman_sachs: 'Goldman Sachs',
};

function subjectName(id: string): string {
  return SUBJECT_NAMES[id] ?? id;
}

function StandingRow({ s }: { s: StandingWith }): JSX.Element {
  const tone = s.net > 5 ? 'good' : s.net < -5 ? 'bad' : 'flat';
  return (
    <div className={`plp-row plp-${tone} ot-panel`}>
      <div className="plp-row-head ot-role-card">
        <div className="ot-avatar" />
        <div className="ot-role-info">
          <div className="ot-role-name plp-name">{subjectName(s.subject)}</div>
        </div>
        <span className={`plp-net font-mono plp-net-${tone}`}>
          {s.net > 0 ? '+' : ''}
          {Math.round(s.net)}
        </span>
      </div>

      {/* 最重的一笔未结怨 —— 这是玩家最该记得的那件事 */}
      {s.sorest && (
        <div className="plp-sore">
          记着：{s.sorest.what}
          <span className="plp-date">（{s.sorest.date}）</span>
        </div>
      )}

      {(s.leverageAgainst.length > 0 || s.leverageOver.length > 0) && (
        <div className="plp-lev">
          {s.leverageAgainst.map((e) => (
            <div key={e.id} className="plp-lev-against">
              ⚠ 对方握着：{e.what}
            </div>
          ))}
          {s.leverageOver.map((e) => (
            <div key={e.id} className="plp-lev-over">
              你握着：{e.what}
            </div>
          ))}
        </div>
      )}

      <div className="plp-bars">
        <div className="ot-metric plp-metric">
          <div className="ot-metric-label">人情</div>
          <div className="ot-metric-value">{Math.round(s.debt)}</div>
        </div>
        <div className="ot-metric plp-metric plp-metric-grudge">
          <div className="ot-metric-label">积怨</div>
          <div className="ot-metric-value">{Math.round(s.grudge)}</div>
        </div>
      </div>
    </div>
  );
}

export function PowerLedgerPanel({ state, asOfDate }: PowerLedgerPanelProps): JSX.Element {
  const rows = ledgerSummary(state, asOfDate);

  return (
    <div className="panel plp-panel" data-testid="power-ledger-panel">
      <div className="title">
        <span>
          人情与积怨 <span className="en-secondary">STANDING &amp; GRUDGES</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="plp-empty ot-empty-state">
          还没有欠下或积下任何一笔。你在这个圈子里做的每个选择都会记在这里——
          帮过谁、得罪过谁、谁手上握着你的什么。
        </div>
      ) : (
        <div className="plp-rows">
          {rows.map((r) => (
            <StandingRow key={r.subject} s={r} />
          ))}
        </div>
      )}

      <div className="v28-data-boundary-note">
        <strong>这一屏是游戏模拟。</strong>
        其中的人物、机构与监管流程均为虚构，标注
        <span className="font-mono"> SIMULATED</span>，不对应任何真实个人、公司或执法程序。
        <div style={{ marginTop: 4 }}>
          规则上有一条刻意的不对称：<strong>人情会随时间变淡，积怨不会。</strong>
          帮过你的人情三十天衰减一半，逼你及时兑现；得罪过的人则一直记着，
          直到他找到合适的时机把这笔账拿出来算。
        </div>
      </div>
    </div>
  );
}
