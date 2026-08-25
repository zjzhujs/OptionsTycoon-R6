import React, { useEffect, useMemo, useState } from 'react';
import { standingHistory, standingWith } from '../engine/engines/grudge_ledger';
import type { GrudgeLedgerEntry } from '../engine/schemas';
import { SeatTrace } from './fx/MiniViz';

/**
 * 作战席位（War Room Rail）· 2026-08-19 claude
 *
 * ── 为什么要做这个 ────────────────────────────────────────────────
 *
 * 此前 War Room 只是一个**弹窗**：不点开就完全看不见人。于是这些角色对玩家来说
 * 只是偶尔跳出来的对话框，而不是"一直坐在你旁边的团队"。
 * V27 评测里"感受不到被背叛被绞杀的实感"，有一半是这么来的——
 * 人不在场，压力就不存在。
 *
 * 这一屏把他们变成常驻席位：谁在什么状态，一眼能看见。
 *
 * ── 状态从哪来（不是装饰）────────────────────────────────────────
 *
 * 每个人的"压力"不是随机数，也不是写死的：
 *   - 好感度来自 favor_balances（人物事件里的选择真实改动它）
 *   - 积怨来自 V30 的 grudge_ledger（记着你具体做过什么）
 *   - 风控官 Victor 额外看基金自身的回撤与杠杆——他的职责决定了他先急
 *
 * 所以席位上的红灯是玩家自己点亮的，不是氛围灯。
 */

export type DeskPressure = 'CALM' | 'WATCHING' | 'TENSE' | 'CRITICAL';

interface Seat {
  id: string;
  name: string;
  role: string;
  /** 该角色最在意的维度，决定他在什么情况下先变脸 */
  watches: 'thesis' | 'risk' | 'execution' | 'capital' | 'press';
}

const SEATS: Seat[] = [
  { id: 'maya_chen', name: 'Maya Chen', role: '首席投研', watches: 'thesis' },
  { id: 'victor_hale', name: 'Victor Hale', role: '风控官', watches: 'risk' },
  { id: 'leo_park', name: 'Leo Park', role: '交易执行', watches: 'execution' },
  { id: 'daniel_ross', name: 'Daniel Ross', role: '投资者关系', watches: 'capital' },
];

const PRESSURE_LABEL: Record<DeskPressure, string> = {
  CALM: '平稳',
  WATCHING: '关注',
  TENSE: '紧张',
  CRITICAL: '临界',
};

export interface WarRoomRailProps {
  state: {
    favor_balances?: Record<string, number>;
    grudge_ledger?: GrudgeLedgerEntry[];
    max_drawdown_pct?: number;
    cash?: number;
    margin_debt?: number;
    fund_stats?: { lp_confidence?: number };
    character_emotions?: Record<string, { emotion?: string; intensity?: number }>;
  };
  asOfDate: string;
  /** 未处理的人物/权力事件数——决定席位上要不要挂红点 */
  pendingEvents?: number;
  /** V2 视觉：命中的席位升 L2 说话态，其余 L1 行（dante P0-2）。 */
  activeSpeakerId?: string;
  /**
   * 玩家已经走过的交易日（含当天），按时间升序。
   * 席位轨迹按这串日期从账本重算——所以刷新/读档后轨迹自动还原，
   * 不需要任何持久化，也不会和账本对不上。
   */
  dateHistory?: string[];
  onOpenEvents?: () => void;
  onOpenLedger?: () => void;
  /** Open the full War Room focused conceptually on this seat. */
  onOpenRoom?: (seatId: string) => void;
  forceExpanded?: boolean;
}

function legacyPressureFor(seat: Seat, p: WarRoomRailProps): DeskPressure {
  const s = p.state;
  const drawdown = Number(s.max_drawdown_pct ?? 0);
  const lp = Number(s.fund_stats?.lp_confidence ?? 50);
  const cash = Number(s.cash ?? 0);
  const debt = Number(s.margin_debt ?? 0);
  const leverage = cash > 0 ? debt / cash : debt > 0 ? Infinity : 0;
  const favor = Number(s.favor_balances?.[seat.id] ?? 0);
  const grudge = standingWith(s, seat.id, p.asOfDate).grudge;

  // 先看这个人自己的账：被得罪狠了，他不会因为基金赚钱就没脾气
  let level = 0;
  if (grudge >= 30 || favor <= -20) level = 3;
  else if (grudge >= 12 || favor <= -8) level = 2;
  else if (grudge > 0 || favor < 0) level = 1;

  // 再叠上他职责范围内的压力源
  if (seat.watches === 'risk') {
    if (drawdown >= 15 || leverage >= 3) level = 3;
    else if (drawdown >= 10 || leverage >= 1.5) level = Math.max(level, 2);
    else if (drawdown >= 5) level = Math.max(level, 1);
  }
  if (seat.watches === 'capital') {
    if (lp <= 35) level = 3;
    else if (lp <= 45) level = Math.max(level, 2);
    else if (lp <= 48) level = Math.max(level, 1);
  }
  if (seat.watches === 'thesis' && drawdown >= 12) level = Math.max(level, 2);

  return (['CALM', 'WATCHING', 'TENSE', 'CRITICAL'] as DeskPressure[])[level];
}

function pressureFor(seat: Seat, p: WarRoomRailProps): DeskPressure {
  const affect = p.state.character_emotions?.[seat.id];
  if (!affect) return legacyPressureFor(seat, p);
  const emotion = String(affect.emotion ?? '').toUpperCase();
  const intensity = Number(affect.intensity ?? 0);
  if (emotion === 'PANIC' || emotion === 'FEAR' || emotion === 'ANGRY' || intensity >= 76) return 'CRITICAL';
  if (emotion === 'PRESSURED' || emotion === 'HURT' || emotion === 'FRUSTRATED' || intensity >= 60) return 'TENSE';
  if (emotion === 'SUSPICIOUS' || emotion === 'UNEASY' || intensity >= 40) return 'WATCHING';
  return 'CALM';
}

/** 一句话说清"他现在为什么是这个状态"——不给抽象数值 */
function seatLine(seat: Seat, p: WarRoomRailProps, level: DeskPressure): string {
  const st = standingWith(p.state, seat.id, p.asOfDate);
  if (st.sorest) return `死死盯着你：${st.sorest.what}`;
  if (level === 'CRITICAL') {
    if (seat.watches === 'risk') return 'Holy shit，敞口太他妈大了，立刻给我 fucking 砍掉！';
    if (seat.watches === 'capital') return 'LP 电话打爆了，Bullshit！这破窟窿老子兜不住了！';
    return '脸拉得老长，对你现在的狗屎操作极度不满。';
  }
  if (level === 'TENSE') {
    if (seat.watches === 'risk') return '死盯着回撤，随时准备 fucking 拔你网线。';
    if (seat.watches === 'thesis') return '眉头紧锁查逻辑链，随时准备怼你。';
    if (seat.watches === 'execution') return '点差太 fucking 宽了，他在疯狂骂娘压成本。';
    return '在琢磨怎么向合规解释你这笔烂账。';
  }
  if (level === 'WATCHING') return '盯着屏幕，暂时没挑出毛病。';
  return '风平浪静。';
}

function emotionSuffixFor(level: DeskPressure): string {
  switch (level) {
    case 'CRITICAL':
      return 'furious';
    case 'TENSE':
      return 'stressed';
    case 'WATCHING':
      return 'questioning';
    case 'CALM':
    default:
      return 'relaxed';
  }
}

export function WarRoomRail(props: WarRoomRailProps): JSX.Element {
  const { pendingEvents = 0, onOpenEvents, onOpenLedger, dateHistory, activeSpeakerId, forceExpanded = false } = props;
  const seats = SEATS.map((s) => ({
    seat: s,
    level: pressureFor(s, props),
    // 账本净值：正数=他欠你人情，负数=他记着你。波形画的就是这条。
    standing: standingWith(props.state, s.id, props.asOfDate).net,
  }));

  const isCriticalOrTense = seats.some((s) => s.level === 'CRITICAL' || s.level === 'TENSE');
  const autoActive = pendingEvents > 0 || isCriticalOrTense;
  const [expanded, setExpanded] = useState(forceExpanded || autoActive);

  useEffect(() => {
    if (forceExpanded || autoActive) setExpanded(true);
  }, [autoActive, forceExpanded]);

  /**
   * 每个人的往来轨迹：**从账本重算，不再记内存**（2026-08-19 claude）
   */
  const traces = useMemo(() => {
    const out: Record<string, number[]> = {};
    if (!dateHistory || dateHistory.length === 0) return out;
    for (const s of SEATS) out[s.id] = standingHistory(props.state, s.id, dateHistory);
    return out;
  }, [props.state, dateHistory]);

  // 最紧张的排在最上面：一次只突出最重要的压力源，但不隐藏其余席位
  const order: DeskPressure[] = ['CRITICAL', 'TENSE', 'WATCHING', 'CALM'];
  seats.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  // R6.6: all four decision-makers remain present. Pressure changes ordering and
  // emphasis, never membership; hiding a seat would erase actionable context.
  const visibleSeats = seats;

  return (
    <details
      className={`wrr wrr-drawer ui-enforced wrr-rail ui-chrome ${autoActive ? 'wrr-state-active' : 'wrr-state-quiet'}`}
      data-layer="L0"
      data-visual-key="war-room-rail"
      data-testid="war-room-rail"
      aria-label="作战席位"
      open={forceExpanded || expanded}
      onToggle={(e) => {
        if (!forceExpanded) setExpanded(e.currentTarget.open);
      }}
    >
      <summary className="wrr-head wrr-drawer-summary">
        <div className="wrr-head-left">
          <span className="wrr-title">
            作战席位 <span className="en-secondary">WAR ROOM</span>
          </span>
          {!expanded && (
            <div className="wrr-avatar-mini-dots" aria-hidden>
              {seats.map(({ seat, level }) => (
                <span
                  key={seat.id}
                  className={`wrr-mini-dot wrr-mini-dot-${level.toLowerCase()}`}
                  title={`${seat.name}: ${PRESSURE_LABEL[level]}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="wrr-head-right">
          {pendingEvents > 0 && (
            <span className="wrr-pending ot-badge ot-badge-risk font-mono">{pendingEvents} 待表态</span>
          )}
          <span className="wrr-drawer-chevron" aria-hidden="true">⌄</span>
        </div>
      </summary>

      <div className="wrr-drawer-body">
      {pendingEvents > 0 && onOpenEvents && (
        <button type="button" className="ot-btn ot-btn-primary wrr-event-cta ui-btn ui-btn-primary" onClick={onOpenEvents}>
          处理 {pendingEvents} 件人物 / 权力事件
        </button>
      )}
      <div className="wrr-seats">
        {visibleSeats.map(({ seat, level }) => {
          const emotion = emotionSuffixFor(level);
          return (
            <button
              type="button"
              key={seat.id}
              className={`ot-role-card wrr-seat-card wrr-seat-${level.toLowerCase()} ui-surface ${activeSpeakerId === seat.id ? 'ui-l2 is-speaking' : 'ui-l1'}`}
              data-speaking={activeSpeakerId === seat.id ? 'true' : 'false'}
              data-visual-key={`war-seat-${seat.id.split('_')[0]}`}
              data-testid={`seat-${seat.id}`}
              aria-label={`Open War Room · ${seat.name}`}
              onClick={() => props.onOpenRoom?.(seat.id)}
            >
              <div className="wrr-avatar-wrap ui-media-frame" aria-hidden>
                <picture>
                  <source
                    media="(max-width: 768px)"
                    srcSet={`/art/characters/${seat.id}_${emotion}.mobile.webp`}
                    type="image/webp"
                  />
                  <source
                    srcSet={`/art/characters/${seat.id}_${emotion}.webp`}
                    type="image/webp"
                  />
                  <img
                    src={`/art/characters/${seat.id}_${emotion}.webp`}
                    alt={seat.name}
                    /* 人物图加载策略见 assetResolver.ts 顶部：
                       lazy + async decode + 显式尺寸，三条缺一不可。
                       换成 1024×1536 之后同步解码会卡主线程。 */
                    decoding="async"
                    width={92}
                    height={118}
                    className="wrr-avatar-img"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.endsWith(`${seat.id}.webp`)) {
                        target.src = `/art/characters/${seat.id}.webp`;
                      }
                    }}
                  />
                </picture>
                <span className={`wrr-avatar-badge wrr-avatar-badge-${level.toLowerCase()}`}>
                  {PRESSURE_LABEL[level]}
                </span>
              </div>
              <div className="ot-role-content wrr-role-content">
                <div className="ot-role-header">
                  <div className="ot-section-titles">
                    <span className="ot-role-name">{seat.name}</span>
                    <span className="ot-role-title">{seat.role}</span>
                  </div>
                  <span className={`ot-badge ot-badge-${level.toLowerCase()}`}>
                    <span className="ot-badge-dot"></span>
                    {PRESSURE_LABEL[level]}
                  </span>
                </div>
                <div className="ot-role-quote wrr-seat-line">{seatLine(seat, props, level)}</div>
                <span className={`wrr-seat-status wrr-seat-status-${level.toLowerCase()}`}>{PRESSURE_LABEL[level]}</span>
                <div className="ot-role-footer wrr-role-footer">
                  {/* 真实的紧张度曲线：玩家走过的每一天，这个人当天的压力档位。
                      不足 3 天时 Waveform 自己走空态——不硬凑一条线出来。 */}
                  <div className="ot-minichart wrr-minichart" title={`${seat.name} 的紧张度：按你走过的每一天记录`}>
                    {/* 换成连续细折线（AVG：「必须换成连续细折线或密集的柱子」）。
                        柱状表达不了穿越零点，而这条线画的是带符号的账本净值。 */}
                    <SeatTrace
                      source="seatStanding"
                      points={traces[seat.id] ?? null}
                      width={118}
                      height={38}
                      color={
                        level === 'CRITICAL'
                          ? 'var(--thm-risk)'
                          : level === 'TENSE'
                          ? 'var(--thm-gold)'
                          : level === 'WATCHING'
                          ? 'var(--thm-accent)'
                          : 'var(--thm-dim)'
                      }
                    />
                  </div>
                  <div className={`wrr-equalizer wrr-eq-${level.toLowerCase()}`} aria-hidden>
                    <span className="wrr-eq-bar b1"></span>
                    <span className="wrr-eq-bar b2"></span>
                    <span className="wrr-eq-bar b3"></span>
                    <span className="wrr-eq-bar b4"></span>
                    <span className="wrr-eq-bar b5"></span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button type="button" className="ot-btn ot-btn-secondary ui-btn" style={{ width: '100%' }} onClick={onOpenLedger}>
        ⚖️ 查看人情与积怨
      </button>

      <div className="wrr-note">
        席位状态由<strong>你的选择</strong>驱动：好感来自人物事件，积怨来自恩怨账本，
        风控官额外看基金自身的回撤与杠杆。这里不显示随机氛围。
      </div>
      </div>
    </details>
  );
}
