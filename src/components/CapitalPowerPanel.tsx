import React, { useState } from 'react';
import type {
  ManagementCompanyState,
  GPWealthState,
  Employee,
  EmployeeRole,
  DataSubscription,
  AIStackState,
  AIStackLevel,
  EvidenceState,
  EconomyState,
  IntelState,
  IntelTier,
  FundStats,
} from '../types';
import { money } from '../lib/format';
import { audioManager } from '../lib/audio';
import { formatInvestigationStage, formatDataCategory, formatAIStack } from '../lib/financialLanguage';
import { AnimatedNumber } from './fx/AnimatedNumber';
import { ElectricBorder } from './fx/ElectricBorder';
import { BorderBeam } from './fx/BorderBeam';
import { MoneySpendPanel } from './MoneySpendPanel';
import { CppGaugeCard, normalizeGaugeAmount } from './CppGauges';
const BackgroundBeamsWithCollision = React.lazy(() =>
  import('./fx/BackgroundBeamsWithCollision').then((m) => ({ default: m.BackgroundBeamsWithCollision }))
);

export interface CapitalPowerPanelProps {
  managementCompany: ManagementCompanyState;
  gpWealth: GPWealthState;
  employees: Employee[];
  dataSubscriptions: DataSubscription[];
  aiStack: AIStackState;
  evidenceState: EvidenceState;
  fundNav?: number;
  economy?: EconomyState;
  intel?: IntelState;
  fundStats?: FundStats;
  onHire: (role: EmployeeRole, name: string) => Promise<string>;
  onFire: (employeeId: string) => Promise<string>;
  onBonus: (employeeId: string, bonusPct: number) => Promise<string>;
  onSubscribeData: (key: string) => Promise<string>;
  onCancelData: (subscriptionId: string) => Promise<string>;
  onUpgradeAI: (level: AIStackLevel) => Promise<string>;
  onInjectGp: (amount: number) => Promise<string>;
  onDistributeGp: (amount: number) => Promise<string>;
  onSubscribeIntel?: (tier: IntelTier, shadowEnabled: boolean) => Promise<string>;
}

const ROLE_LABELS: Record<EmployeeRole, string> = {
  RESEARCH_ASSOCIATE: '研究助理 Research Associate',
  SENIOR_ANALYST: '高级分析师 Senior Analyst',
  MACRO_STRATEGIST: '宏观策略师 Macro Strategist',
  QUANT_RESEARCHER: '量化研究员 Quant Researcher',
  RISK_MANAGER: '风控经理 Risk Manager',
  COMPLIANCE_OFFICER: '合规官 Compliance Officer',
  LEGAL_COUNSEL: '法律顾问 Legal Counsel',
  DATA_ENGINEER: '数据工程师 Data Engineer',
  AI_ENGINEER: 'AI 工程师 AI Engineer',
  INVESTOR_RELATIONS: '投资者关系 IR',
  OPERATIONS: '运营 Operations',
};

const DATA_CATALOG: { key: string; name: string; category: string; monthlyCost: number }[] = [
  { key: 'options_flow_premium', name: '机构级期权流数据订阅', category: 'OPTIONS_DATA', monthlyCost: 8000 },
  { key: 'alt_data_satellite', name: '另类数据 · 卫星与信用卡流水', category: 'ALT_DATA', monthlyCost: 15000 },
  { key: 'news_wire_premium', name: '高级新闻电报订阅', category: 'NEWS', monthlyCost: 3000 },
  { key: 'filings_parser', name: '监管文件自动解析工具', category: 'FILINGS', monthlyCost: 5000 },
  { key: 'transcript_analytics', name: '财报电话会议转录分析', category: 'TRANSCRIPTS', monthlyCost: 6000 },
  { key: 'macro_data_terminal', name: '宏观数据终端', category: 'MACRO', monthlyCost: 4500 },
  { key: 'policy_research_service', name: '政策研究订阅服务', category: 'POLICY', monthlyCost: 5500 },
];

const AI_LEVELS: { level: AIStackLevel }[] = [
  { level: 'LEVEL_0_MANUAL' },
  { level: 'LEVEL_1_ASSISTANT' },
  { level: 'LEVEL_2_MULTI_AGENT' },
  { level: 'LEVEL_3_INSTITUTIONAL' },
];

const STAGE_SEVERITY: Record<string, string> = {
  CLEAN: 'cpp-stage-clean',
  SUSPICIOUS: 'cpp-stage-notable',
  INTERNAL_CONCERN: 'cpp-stage-notable',
  REGULATORY_INQUIRY: 'cpp-stage-high',
  FORMAL_INVESTIGATION: 'cpp-stage-high',
  CIVIL_ENFORCEMENT: 'cpp-stage-high',
  CRIMINAL_INVESTIGATION: 'cpp-stage-critical',
  CHARGED: 'cpp-stage-critical',
  TRIAL: 'cpp-stage-critical',
  CONVICTED: 'cpp-stage-critical',
  SETTLED: 'cpp-stage-notable',
  ACQUITTED: 'cpp-stage-clean',
};

type Tab = 'SPEND' | 'TEAM' | 'DATA' | 'AI' | 'GP';

export function CapitalPowerPanel({
  managementCompany,
  gpWealth,
  employees,
  dataSubscriptions,
  aiStack,
  evidenceState,
  fundNav,
  economy,
  intel,
  fundStats,
  onHire,
  onFire,
  onBonus,
  onSubscribeData,
  onCancelData,
  onUpgradeAI,
  onInjectGp,
  onDistributeGp,
  onSubscribeIntel,
}: CapitalPowerPanelProps): JSX.Element {
  const hasSpend = Boolean(economy && intel && onSubscribeIntel);
  const [tab, setTab] = useState<Tab>(hasSpend ? 'SPEND' : 'TEAM');
  const [hireRole, setHireRole] = useState<EmployeeRole>('RESEARCH_ASSOCIATE');
  const [hireName, setHireName] = useState('');
  const [gpAmount, setGpAmount] = useState(10000);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const runwayCritical = managementCompany.runway_months < 6;
  const isInvestigationCritical =
    evidenceState?.investigation_stage === 'CRIMINAL_INVESTIGATION' ||
    evidenceState?.investigation_stage === 'FORMAL_INVESTIGATION' ||
    evidenceState?.investigation_stage === 'CHARGED';

  const toFiniteOrNull = (value: number | null | undefined): number | null =>
    Number.isFinite(value) ? (value as number) : null;
  const managementCash = toFiniteOrNull(managementCompany?.cash);
  const monthlyBurn = toFiniteOrNull(managementCompany?.monthly_burn);
  const feeIncomeYtd = toFiniteOrNull(managementCompany?.fee_income_ytd);
  const performanceIncomeYtd = toFiniteOrNull(managementCompany?.performance_income_ytd);
  const gpCash = toFiniteOrNull(gpWealth?.cash);
  const annualizedBurn = toFiniteOrNull(managementCompany?.annualized_burn);
  const annualOperatingBudget = Math.max(
    annualizedBurn ?? ((monthlyBurn ?? 0) * 12),
    (monthlyBurn ?? 0) * 12,
    12_000 * 12,
  );
  const monthlyBudget = annualOperatingBudget / 12;
  const runwayLabel = Number.isFinite(managementCompany?.runway_months)
    ? `${managementCompany.runway_months.toFixed(1)} MO RUNWAY`
    : undefined;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    audioManager.playSfx('ui_click');
    try {
      const msg = await fn();
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cpp-panel ui-enforced ui-surface ui-l2" style={{ position: 'relative' }}>
      <div className="cpp-head">
        <div>
          <h2 className="cpp-h2">
            <span className="cpp-dot" />
            资本与权力（CAPITAL &amp; POWER）· 管理公司经营
          </h2>
          <p className="cpp-sub">
            管理公司现金与基金资产严格隔离——招人、买数据、升级 AI、灰色/违法机会，全部只花管理公司现金或 GP 个人财富，绝不动用 LP 托管的基金资产。
          </p>
        </div>
        <div className={`cpp-runway ${runwayCritical ? 'cpp-runway-critical' : ''}`}>
          <div className="cpp-runway-label">现金可维持月数（RUNWAY）</div>
          <div className="cpp-runway-val font-mono">
            {Number.isFinite(managementCompany?.runway_months)
              ? managementCompany.runway_months >= 999
                ? '∞'
                : `${managementCompany.runway_months.toFixed(1)} 个月`
              : '—'}
          </div>
        </div>
      </div>

      {toast && <div className="cpp-toast font-mono">{toast}</div>}

      <div className="cpp-kpirow font-mono" data-testid="cpp-kpi-gauges">
        <div className="cpp-kpi">
          <CppGaugeCard
            label="管理公司现金（MANAGEMENT CO. CASH）"
            value={normalizeGaugeAmount(managementCash, annualOperatingBudget)}
            displayValue={managementCash == null ? undefined : <AnimatedNumber value={managementCash} formatFn={(n) => money(n)} />}
            displayLabel={managementCash == null ? undefined : money(managementCash)}
            delta={runwayLabel}
            source="CASH RESERVE / 12-MONTH BUDGET"
            tone={runwayCritical ? 'red' : 'cyan'}
          />
        </div>
        <div className="cpp-kpi">
          <CppGaugeCard
            label="月度运营支出（MONTHLY BURN）"
            value={normalizeGaugeAmount(monthlyBurn, monthlyBudget)}
            displayValue={monthlyBurn == null ? undefined : <AnimatedNumber value={monthlyBurn} formatFn={(n) => money(n)} />}
            displayLabel={monthlyBurn == null ? undefined : money(monthlyBurn)}
            delta="OPERATING COST"
            source="MONTHLY BUDGET BASELINE"
            tone="amber"
          />
        </div>
        <div className="cpp-kpi">
          <CppGaugeCard
            label="管理费收入（MANAGEMENT FEE YTD）"
            value={normalizeGaugeAmount(feeIncomeYtd, annualOperatingBudget)}
            displayValue={feeIncomeYtd == null ? undefined : <AnimatedNumber value={feeIncomeYtd} formatFn={(n) => money(n)} />}
            displayLabel={feeIncomeYtd == null ? undefined : money(feeIncomeYtd)}
            delta="YTD"
            source="MANAGEMENT FEE INCOME"
            tone="cyan"
          />
        </div>
        <div className="cpp-kpi">
          <CppGaugeCard
            label="业绩报酬（PERFORMANCE FEE YTD）"
            value={normalizeGaugeAmount(performanceIncomeYtd, annualOperatingBudget)}
            displayValue={performanceIncomeYtd == null ? undefined : <AnimatedNumber value={performanceIncomeYtd} formatFn={(n) => money(n)} />}
            displayLabel={performanceIncomeYtd == null ? undefined : money(performanceIncomeYtd)}
            delta="YTD"
            source="PERFORMANCE FEE INCOME"
            tone="cyan"
          />
        </div>
        <div className="cpp-kpi">
          <CppGaugeCard
            label="GP 个人财富（GP WEALTH）"
            value={normalizeGaugeAmount(gpCash, 12_000)}
            displayValue={gpCash == null ? undefined : <AnimatedNumber value={gpCash} formatFn={(n) => money(n)} />}
            displayLabel={gpCash == null ? undefined : money(gpCash)}
            delta="GP WALLET"
            source="PERSONAL CAPITAL"
            tone="cyan"
          />
        </div>
      </div>

      {/* Investigation status with high-stakes electric border when critical */}
      {isInvestigationCritical ? (
        <ElectricBorder color="var(--thm-risk, #ff4d6d)" speed={1.2} borderRadius={8}>
          <div className={`cpp-evidence ${STAGE_SEVERITY[evidenceState?.investigation_stage ?? 'CLEAN'] ?? ''}`} style={{ margin: 0 }}>
            <div className="cpp-evidence-row">
              <span className="cpp-evidence-label">调查阶段（INVESTIGATION STAGE）</span>
              <span className="cpp-evidence-stage font-mono">{formatInvestigationStage(evidenceState?.investigation_stage ?? 'CLEAN')}</span>
            </div>
            <div className="cpp-evidence-meta font-mono">
              证据风险 {(evidenceState?.evidence_points ?? 0).toFixed(0)} · 知情人 {evidenceState?.witness_count ?? 0} ·
              {' '}内部曝光率 {(evidenceState?.internal_awareness ?? 0).toFixed(0)}% · 外部曝光率 {(evidenceState?.external_awareness ?? 0).toFixed(0)}%
            </div>
            {evidenceState?.simulated_notice && (
              <div className="cpp-evidence-notice">{evidenceState.simulated_notice}</div>
            )}
          </div>
        </ElectricBorder>
      ) : (
        <div className={`cpp-evidence ${STAGE_SEVERITY[evidenceState?.investigation_stage ?? 'CLEAN'] ?? ''}`}>
          <div className="cpp-evidence-row">
            <span className="cpp-evidence-label">调查阶段（INVESTIGATION STAGE）</span>
            <span className="cpp-evidence-stage font-mono">{formatInvestigationStage(evidenceState?.investigation_stage ?? 'CLEAN')}</span>
          </div>
          {evidenceState?.investigation_stage !== 'CLEAN' && (
            <div className="cpp-evidence-meta font-mono">
              证据风险 {(evidenceState?.evidence_points ?? 0).toFixed(0)} · 知情人 {evidenceState?.witness_count ?? 0} ·
              {' '}内部曝光率 {(evidenceState?.internal_awareness ?? 0).toFixed(0)}% · 外部曝光率 {(evidenceState?.external_awareness ?? 0).toFixed(0)}%
            </div>
          )}
          {evidenceState?.simulated_notice && (
            <div className="cpp-evidence-notice">{evidenceState.simulated_notice}</div>
          )}
        </div>
      )}

      <div className="cpp-tabs">
        {([...(hasSpend ? ['SPEND'] : []), 'TEAM', 'DATA', 'AI', 'GP'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`cpp-tab ui-btn ${tab === t ? 'is-active' : ''}`}
            data-variant="compact"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'SPEND' && 'SPEND 资金决策'}
            {t === 'TEAM' && 'TEAM 团队'}
            {t === 'DATA' && 'DATA 数据'}
            {t === 'AI' && 'AI 研究体系'}
            {t === 'GP' && 'GP WEALTH 个人财富'}
          </button>
        ))}
      </div>

      {tab === 'SPEND' && economy && intel && onSubscribeIntel && (
        <MoneySpendPanel
          fundNav={fundNav ?? 0}
          economy={economy}
          intel={intel}
          fundStats={fundStats}
          busy={busy}
          onSubscribeIntel={async (tier, shadowEnabled) => {
            await run(() => onSubscribeIntel(tier, shadowEnabled));
          }}
        />
      )}

      {tab === 'TEAM' && (
        <div className="cpp-section">
          <div className="cpp-hire-row">
            <select
              className="cpp-select"
              value={hireRole}
              onChange={(e) => setHireRole(e.target.value as EmployeeRole)}
            >
              {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <input
              className="cpp-input"
              placeholder="姓名（留空自动生成虚构姓名）"
              value={hireName}
              onChange={(e) => setHireName(e.target.value)}
            />
            <button
              type="button"
              className="ot-btn ui-btn ui-btn-primary"
              data-variant="row"
              disabled={busy}
              onClick={() => run(() => onHire(hireRole, hireName))}
            >
              HIRE 聘用
            </button>
          </div>

          <div className="cpp-emp-list">
            {(!employees || employees.length === 0) && (
              <div className="ot-empty-state">尚未招聘任何团队成员。人手不足会限制研究覆盖面与响应能力。</div>
            )}
            {(employees ?? []).map((emp) => (
              <div key={emp.id} className="ot-role-card cpp-emp-card">
                <div className="ot-avatar">
                  {emp.name ? emp.name.charAt(0) : 'E'}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="cpp-emp-top">
                    <div>
                      <div className="cpp-emp-name">{emp.name || '未命名员工'}</div>
                      <div className="cpp-emp-role">{ROLE_LABELS[emp.role] ?? emp.role}</div>
                    </div>
                    <div className="cpp-emp-salary font-mono">{money(emp.salary_annual ?? 0)}/yr</div>
                  </div>
                  <div className="cpp-emp-meters font-mono">
                    <span>士气（MORALE） {(emp.morale ?? 0).toFixed(0)}</span>
                    <span>忠诚度（LOYALTY） {(emp.loyalty ?? 0).toFixed(0)}</span>
                    {emp.skill !== undefined && <span>能力（SKILL） {emp.skill.toFixed(0)}</span>}
                    <span className={(emp.poaching_risk ?? 0) > 40 ? 'cpp-down' : ''}>
                      被挖角风险（POACHING RISK） {(emp.poaching_risk ?? 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="cpp-emp-actions">
                    <button
                      type="button"
                      className="ot-btn ui-btn"
                      data-variant="compact"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      disabled={busy}
                      onClick={() => run(() => onBonus(emp.id, 30))}
                    >
                      发放奖金 (30%)
                    </button>
                    <button
                      type="button"
                      className="ot-btn ui-btn"
                      data-variant="compact"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      disabled={busy}
                      onClick={() => run(() => onFire(emp.id))}
                    >
                      裁撤
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'DATA' && (
        <div className="cpp-section">
          <div className="cpp-data-list">
            {DATA_CATALOG.map((item) => {
              const active = (dataSubscriptions ?? []).find((s) => s.id === item.key && s.active);
              return (
                <div key={item.key} className="ot-role-card cpp-data-card" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cpp-data-name">{item.name}</div>
                    <div className="cpp-data-meta font-mono">
                      <span className="ot-badge ot-badge-derived" style={{ marginRight: 6 }}>
                        {formatDataCategory(item.category)}
                      </span>
                      · {money(item.monthlyCost)}/mo
                    </div>
                  </div>
                  {active ? (
                    <button
                      type="button"
                      className="ot-btn ui-btn"
                      data-variant="compact"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      disabled={busy}
                      onClick={() => run(() => onCancelData(active.id))}
                    >
                      取消订阅
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ot-btn ui-btn"
                      data-variant="compact"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      disabled={busy}
                      onClick={() => run(() => onSubscribeData(item.key))}
                    >
                      订阅
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cpp-note">
            购买更贵的数据不能凭空生成本构建没有的真实数据源（例如 signed dealer inventory 仍然是 DATA_UNAVAILABLE）。
          </div>
        </div>
      )}

      {tab === 'AI' && (
        <div className="cpp-section" style={{ position: 'relative', overflow: 'hidden' }}>
          {aiStack?.level === 'LEVEL_3_INSTITUTIONAL' && (
            <div style={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }}>
              <React.Suspense fallback={null}>
                <BackgroundBeamsWithCollision />
              </React.Suspense>
            </div>
          )}
          <div className="cpp-ai-current" style={{ position: 'relative', zIndex: 1 }}>
            当前等级：<span className="font-mono">{aiStack?.level ?? 'LEVEL_0_MANUAL'}</span>（{formatAIStack(aiStack?.level ?? 'LEVEL_0_MANUAL')}） · 月度算力开支{' '}
            <span className="font-mono">{money(aiStack?.monthly_compute_cost ?? 0)}</span> · Hallucination Risk{' '}
            <span className="font-mono">{(aiStack?.hallucination_risk ?? 0).toFixed(0)}</span>
          </div>
          <div className="cpp-ai-levels" style={{ position: 'relative', zIndex: 1 }}>
            {AI_LEVELS.map((l) => {
              const isCurrent = l.level === aiStack?.level;
              return (
                <div key={l.level} style={{ position: 'relative', display: 'inline-block' }}>
                  {isCurrent && <BorderBeam size={40} duration={6} colorFrom="var(--thm-gold)" colorTo="var(--thm-accent)" />}
                  <button
                    type="button"
                    className={`ot-btn ui-btn ${isCurrent ? 'ui-btn-primary' : ''}`}
                    data-variant="compact"
                    style={{ padding: '6px 12px', fontSize: 11 }}
                    disabled={busy || isCurrent}
                    onClick={() => run(() => onUpgradeAI(l.level))}
                  >
                    {isCurrent ? `✓ 当前：${formatAIStack(l.level)}` : `升级至 ${formatAIStack(l.level)}`}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="cpp-note" style={{ position: 'relative', zIndex: 1 }}>{aiStack?.model_risk_note ?? ''}</div>
        </div>
      )}

      {tab === 'GP' && (
        <div className="cpp-section">
          <div className="cpp-gp-row">
            <input
              type="number"
              className="cpp-input"
              value={gpAmount}
              onChange={(e) => setGpAmount(Number(e.target.value))}
            />
            <button
              type="button"
              className="ot-btn ui-btn"
              data-variant="row"
              style={{ padding: '6px 12px', fontSize: 11 }}
              disabled={busy}
              onClick={() => run(() => onDistributeGp(gpAmount))}
            >
              管理公司 → GP 个人（分配）
            </button>
            <button
              type="button"
              className="ot-btn ui-btn ui-btn-primary"
              data-variant="row"
              style={{ padding: '6px 12px', fontSize: 11 }}
              disabled={busy}
              onClick={() => run(() => onInjectGp(gpAmount))}
            >
              GP 个人 → 管理公司（注资）
            </button>
          </div>
          <div className="cpp-note">
            个人财富不能直接支付基金层面的义务；法律危机时可用于个人法律辩护开支，
            但不能合法拿 LP 委托资产为个人辩护买单。
          </div>
        </div>
      )}
    </div>
  );
}
