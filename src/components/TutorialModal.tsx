import React, { useState } from 'react';
import { resolveArtSrc, artJpgFallback, basePathFromLegacyUrl } from '../lib/assetResolver';
import { renderWithGlossary } from './GlossaryTerm';

export interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToReplay: () => void;
}

interface TutorialLesson {
  id: string;
  title: string;
  mentor: string;
  mentorRole: string;
  portrait: string;
  content: string[];
  keyTakeaway: string;
  interactiveScenario?: {
    setup: string;
    choices: { label: string; outcome: string; isCorrect: boolean }[];
  };
}

const LESSONS: TutorialLesson[] = [
  {
    id: 'lesson_1_basics',
    title: '第一课：期权买方的非对称杠杆 (Call & Put Basics)',
    mentor: 'Maya Chen',
    mentorRole: 'AI / 半导体行业分析师',
    portrait: '/art/characters/maya_chen.jpg',
    content: [
      '欢迎来到 Dante Capital。在让你碰那几千万美元的资金之前，你必须先把期权的底层数学刻在脑子里。',
      '买入一份看涨期权 (Long Call)，代表你支付了一笔权利金 (Premium)，获得了在到期日前以固定行权价 (Strike) 买入 100 股正股的权利。这只是权利，没有义务。',
      '你的最大亏损死死锁在你付出的权利金上；但如果标的暴涨，你的收益理论上不封顶。这就是非对称杠杆 (Asymmetry)。',
    ],
    keyTakeaway: '期权买方：有限亏损 (权利金)，无限向上收益。但代价是你必须每天承担时间损耗 (Theta)。',
    interactiveScenario: {
      setup: 'NVDA 现价 $130，你预期一周后财报公布将大涨至 $150。你该选择什么期权？',
      choices: [
        {
          label: '买入行权价 $135 的看涨期权 (Long Call)',
          outcome: '对。支付权利金，拿到正股向上的非对称杠杆。',
          isCorrect: true,
        },
        {
          label: '买入行权价 $120 的看跌期权 (Long Put)',
          outcome: '错。Put 是看跌工具，股价大涨会让 Put 的权利金直接归零。',
          isCorrect: false,
        },
      ],
    },
  },
  {
    id: 'lesson_2_spread',
    title: '第二课：做市商与买卖价差陷阱 (Spread & Adverse Selection)',
    mentor: 'Leo Park',
    mentorRole: '高级期权做市商 / Senior Market Maker',
    portrait: '/art/characters/leo_park.jpg',
    content: [
      '我是 Leo。新手总以为看对方向就能赚钱，直到他们被做市商 (Market Maker) 的买卖价差 (Bid-Ask Spread) 狠狠上了一课。',
      '假设一张合约 Bid 是 $5.10，Ask 是 $5.80。你脑子一热点下市价买入，就成交在 $5.80。',
      '这时候现货就算一分钱没跌，你立刻市价卖出只能拿到 $5.10。你进场第一秒就已经亏了 $70（12% 的摩擦成本）。',
    ],
    keyTakeaway: '面对宽价差的期权，严禁使用市价单，必须把限价单挂在中价 (Mid) 争取价格改善。',
    interactiveScenario: {
      setup: '一张虚值 Put 的 Bid 为 $2.00，Ask 为 $2.80，中价为 $2.40。你打算建仓 (Open Position)，该如何下单？',
      choices: [
        {
          label: '挂 $2.40 的限价单 (Limit Order at Mid)',
          outcome: '很好。做市商的算法在流动性 (Liquidity) 充足时会给你中价成交，每张替你省下 $40 的滑点。',
          isCorrect: true,
        },
        {
          label: '直接点击市价买入 (Market Buy at $2.80)',
          outcome: '被做市商生吞！你一进场就白白交了 28% 的价差税。',
          isCorrect: false,
        },
      ],
    },
  },
  {
    id: 'lesson_3_reversal',
    title: '第三课：浮盈不是已实现盈亏 (Unrealized vs Realized P&L)',
    mentor: 'Victor Hale',
    mentorRole: '宏观资深交易员',
    portrait: '/art/characters/victor_hale.jpg',
    content: [
      '在 2008 年，我见过太多账面浮盈 +300% 最终却爆仓清零的年轻经理。',
      '期权有极强的 Gamma 爆发力，也有残忍的时间衰减 (Theta Decay)。浮盈翻倍时，如果不主动分批平仓 (Close Position) 锁定利润，标的只要在阻力位稍有回调，时间价值就会加速湮灭。',
      '牢记一点：未平仓的浮盈只是一串毫无意义的数字。装进账户的已实现盈亏 (Realized P&L)，才是你能打出去的子弹。',
    ],
    keyTakeaway: '未实现盈亏绝不是已实现盈亏 (Unrealized P&L is NOT Realized P&L)。到达目标或遇到阻力时，果断分批止盈是我们的铁律。',
    interactiveScenario: {
      setup: '你买入的 NVDA Call 从 $2.00 暴涨至 $6.00 (+200% 浮盈)，离到期日仅剩 2 天，大盘开始出现熊陡震荡。你该怎么做？',
      choices: [
        {
          label: '平仓至少 50% 锁定本金与翻倍利润 (Partial Close)',
          outcome: '标准的风控。锁住已实现盈亏，剩下的仓位就是零成本的彩票 (Free Roll)。',
          isCorrect: true,
        },
        {
          label: '全部死拿到底，赌最后两天还能再翻一倍',
          outcome: '外行赌徒！只要最后两天稍微横盘，末日的 Theta 衰减和 Gamma 骤降会在几小时内把你的利润吃光。',
          isCorrect: false,
        },
      ],
    },
  },
  {
    id: 'lesson_4_hedging',
    title: '第四课：备兑与现金担保 (Covered Call & CSP)',
    mentor: 'Daniel Ross',
    mentorRole: 'Prime Broker 董事总经理',
    portrait: '/art/characters/daniel_ross.jpg',
    content: [
      '在主经纪商眼里，我们评估一家基金看重的不是暴利，而是现金流和资本保护。',
      '你持有 100 股正股，卖出一手虚值 Call，这叫备兑看涨 (Covered Call)。你提前收了确定的权利金，等于给持股加了一层下行缓冲。',
      '你账户里有闲钱，卖出一手虚值 Put，这叫现金担保看跌 (Cash-Secured Put)。股价不跌，你白拿这笔钱；跌破行权价，你正好打折买入心仪资产。',
    ],
    keyTakeaway: 'Covered Call 与 Cash-Secured Put 是我们在震荡市中提取现金流、降低持仓成本的标准防守配置。',
  },
];

export function TutorialModal({ isOpen, onClose, onJumpToReplay }: TutorialModalProps): JSX.Element | null {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

  if (!isOpen) return null;

  const lesson = LESSONS[currentIdx];
  const glossarySeen = new Set<string>();

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="tutorial-modal-card tutorial-root ui-surface ui-l1" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tutorial-header">
          <div>
            <div className="tutorial-badge">期权大亨实战讲堂 · LESSON {currentIdx + 1} / {LESSONS.length}</div>
            <h2 className="tutorial-title ui-title" data-level="2">{renderWithGlossary(lesson.title, glossarySeen)}</h2>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        {/* Mentor Dialogue */}
        <div className="tutorial-mentor-row tutorial-concept">
          <img
            src={resolveArtSrc(basePathFromLegacyUrl(lesson.portrait))}
            onError={(e) => {
              const img = e.currentTarget;
              const fallback = artJpgFallback(basePathFromLegacyUrl(lesson.portrait));
              if (img.src.endsWith(fallback)) return;
              img.src = fallback;
            }}
            alt={lesson.mentor}
            loading="lazy"
            className="tutorial-mentor-avatar"
          />
          <div className="tutorial-mentor-dialogue">
            <div className="mentor-name">
              {lesson.mentor} <span className="mentor-role">· {lesson.mentorRole}</span>
            </div>
            {lesson.content.map((p, i) => (
              <p key={i} className="mentor-p">{renderWithGlossary(p, glossarySeen)}</p>
            ))}
          </div>
        </div>

        {/* Interactive Scenario */}
        {lesson.interactiveScenario && (
          <div className="tutorial-interactive-box tutorial-interactive ui-surface ui-l2">
            <div className="scenario-title">💡 实盘情境推演：</div>
            <p className="scenario-desc">{renderWithGlossary(lesson.interactiveScenario.setup, glossarySeen)}</p>
            <div className="scenario-choices">
              {lesson.interactiveScenario.choices.map((c, i) => (
                <button
                  key={i}
                  className={`btn-choice-option ui-btn ${selectedChoice === i ? (c.isCorrect ? 'correct' : 'wrong') : ''}`}
                  data-variant="row"
                  aria-pressed={selectedChoice === i}
                  onClick={() => setSelectedChoice(i)}
                >
                  <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{renderWithGlossary(c.label, glossarySeen)}</span>
                </button>
              ))}
            </div>
            {selectedChoice != null && (
              <div className={`scenario-feedback ${lesson.interactiveScenario.choices[selectedChoice].isCorrect ? 'feedback-correct' : 'feedback-wrong'}`}>
                {renderWithGlossary(lesson.interactiveScenario.choices[selectedChoice].outcome, glossarySeen)}
              </div>
            )}
          </div>
        )}

        {/* Key Takeaway */}
        <div className="tutorial-takeaway tutorial-concept">
          <strong>📌 核心法则：</strong> {renderWithGlossary(lesson.keyTakeaway, glossarySeen)}
        </div>

        {/* Navigation Footer */}
        <div className="tutorial-footer">
          <button
            className="ot-btn ot-btn-secondary ui-btn"
            data-variant="row"
            onClick={() => {
              setSelectedChoice(null);
              setCurrentIdx((i) => Math.max(0, i - 1));
            }}
            disabled={currentIdx === 0}
          >
            ◀ 上一课
          </button>

          <div className="tutorial-dots">
            {LESSONS.map((_, i) => (
              <span
                key={i}
                className={`dot ${i < currentIdx ? 'is-done' : i === currentIdx ? 'active' : ''}`}
                onClick={() => {
                  setSelectedChoice(null);
                  setCurrentIdx(i);
                }}
              />
            ))}
          </div>

          {currentIdx < LESSONS.length - 1 ? (
            <button
              className="ot-btn ui-btn ui-btn-primary"
              onClick={() => {
                setSelectedChoice(null);
                setCurrentIdx((i) => i + 1);
              }}
            >
              下一课 ▶
            </button>
          ) : (
            <button
              className="ot-btn ui-btn ui-btn-primary"
              onClick={() => {
                onClose();
                onJumpToReplay();
              }}
            >
              进入历史实盘演练 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
