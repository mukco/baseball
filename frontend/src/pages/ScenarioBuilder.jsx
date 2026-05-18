import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

// ---------------------------------------------------------------------------
// FormulaPanel — collapsible explanation for each projection lever.
// Shows the exact formula from the engine, variable definitions, and a
// worked example with real numbers so you can build intuition.
// ---------------------------------------------------------------------------
function FormulaPanel({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-light transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide formula' : 'How this formula works'}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-bg-border bg-bg-elevated text-sm leading-relaxed overflow-hidden">
          {children}
        </div>
      )}
    </div>
  )
}

// A styled line inside FormulaPanel for the formula itself
function Formula({ children }) {
  return (
    <div className="px-4 py-3 bg-bg-raised border-b border-bg-border">
      <pre className="font-mono text-xs text-content-primary whitespace-pre-wrap leading-relaxed">{children}</pre>
    </div>
  )
}

// A section within FormulaPanel
function FSection({ title, children }) {
  return (
    <div className="px-4 py-3 border-b border-bg-border last:border-0 space-y-1">
      {title && <div className="text-[10px] font-bold uppercase tracking-widest text-content-muted mb-1.5">{title}</div>}
      {children}
    </div>
  )
}

// Code reference badge
function CodeRef({ path }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-bg-raised border border-bg-border rounded px-1.5 py-0.5 text-content-muted">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
      {path}
    </span>
  )
}

const DEFAULT_PARAMS = {
  name: '',
  description: '',
  year1_weight: 5,
  year2_weight: 4,
  year3_weight: 3,
  regression_factor: 1.0,
  age_curve_enabled: true,
  age_curve_factor: 1.0,
  statcast_weight: 0.5,
  park_factors_enabled: true,
  default_pa: 550,
  default_ip: 160,
  era_fip_blend: 0.5,
  history_years: 3,
  min_pa_for_history: 30,
  min_ip_for_history: 5.0,
}

function SliderField({ label, hint, name, value, min, max, step = 0.05, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-content-primary">{label}</label>
        <span className="font-mono text-sm text-brand font-semibold">{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(name, Number(e.target.value))}
        className="w-full accent-brand"
      />
      <div className="flex justify-between text-[10px] text-content-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

function NumberField({ label, hint, name, value, min, max, step = 1, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-content-primary">{label}</label>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(name, Number(e.target.value))}
        className="w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand font-mono"
      />
    </div>
  )
}

function ToggleField({ label, hint, name, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-content-primary">{label}</div>
        {hint && <div className="text-xs text-content-muted">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(name, !value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          value ? 'bg-brand' : 'bg-bg-border'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

const YEAR_PRESETS = [
  { label: 'Recent-heavy', values: [5, 4, 3], hint: 'Standard (Steamer-style)' },
  { label: 'Equal weight', values: [3, 3, 3], hint: 'Each year treated equally' },
  { label: 'Last year only', values: [1, 0, 0], hint: 'Single-season projection' },
  { label: 'Two-year',      values: [2, 1, 0], hint: 'Ignore 3 years ago' },
]

function ScenarioForm({ initial, onSave, onCancel, saving }) {
  const [params, setParams] = useState({ ...DEFAULT_PARAMS, ...initial })

  function handleChange(name, value) {
    setParams((p) => ({ ...p, [name]: value }))
  }

  function applyPreset(values) {
    setParams((p) => ({ ...p, year1_weight: values[0], year2_weight: values[1], year3_weight: values[2] }))
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(params) }}
      className="space-y-8"
    >
      {/* Name & description */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-content-primary">Name</label>
          <input
            value={params.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            placeholder="e.g. Aggressive Regression"
            className="mt-1 w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-content-primary">Description <span className="text-content-muted font-normal">(optional)</span></label>
          <textarea
            value={params.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe what this scenario tests…"
            rows={2}
            className="mt-1 w-full bg-bg-elevated border border-bg-border rounded-md px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand resize-none"
          />
        </div>
      </div>

      {/* Year weights */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Year Weights</h3>
        <p className="text-xs text-content-muted -mt-2">
          How much to weight each historical season. Higher = more influence. Each season is also PA-weighted, so a player with 600 PA one year counts more than 200 PA.
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {YEAR_PRESETS.map((preset) => {
            const active = preset.values[0] === params.year1_weight && preset.values[1] === params.year2_weight && preset.values[2] === params.year3_weight
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.values)}
                title={preset.hint}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? 'bg-brand text-white'
                    : 'bg-bg-elevated border border-bg-border text-content-secondary hover:text-content-primary'
                }`}
              >
                {preset.label} ({preset.values.filter((v) => v > 0).join('/')})
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <SliderField label="This season" name="year1_weight" value={params.year1_weight} min={0} max={10} step={0.5} onChange={handleChange} />
          <SliderField label="1 year ago" name="year2_weight" value={params.year2_weight} min={0} max={10} step={0.5} onChange={handleChange} />
          <SliderField label="2 years ago" name="year3_weight" value={params.year3_weight} min={0} max={10} step={0.5} onChange={handleChange} />
        </div>

        <FormulaPanel>
          <Formula>{`projected_rate = Σ(rateᵢ × PAᵢ × weightᵢ) / Σ(PAᵢ × weightᵢ)`}</Formula>
          <FSection title="Variables">
            <p className="text-xs text-content-secondary"><code className="font-mono">rateᵢ</code> — the component rate in season i (e.g. BABIP in 2024)</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">PAᵢ</code> — plate appearances that season. More PA = more signal = more weight.</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">weightᵢ</code> — your slider value for that season (e.g. 5 for "this season")</p>
          </FSection>
          <FSection title="Worked example — BABIP with 5/4/3 weights">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`2024: .305 × 580 PA × 5 = 884.5
2023: .285 × 520 PA × 4 = 592.8
2022: .315 × 440 PA × 3 = 415.8

Total weight: (580×5) + (520×4) + (440×3) = 6300
projected BABIP = 1893.1 / 6300 = .300

The most-recent season gets 46% of the weight (2900/6300),
2023 gets 33%, 2022 gets 21%. Recent performance dominates
without completely ignoring older signal.`}</pre>
          </FSection>
          <FSection title="Why this matters">
            <p className="text-xs text-content-secondary">
              Baseball performance is noisy. A player who hit .280 last year after two years at .260 might be
              genuinely better, or might have gotten lucky. Blending across years forces the projection
              to require consistency, not just recency. Setting "last year only" (1/0/0) trusts a single
              season entirely — fine for young players with few years of data, risky for veterans.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_engine.rb → weighted_average" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* Regression */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Regression to Mean</h3>
        <SliderField
          label="Regression Factor"
          hint="Multiplier on stabilization constants. 1× = standard (e.g. BABIP stabilizes at ~820 PA). 2× = more aggressive regression toward league average. 0.5× = trust the outlier more."
          name="regression_factor"
          value={params.regression_factor}
          min={0.25}
          max={3.0}
          step={0.05}
          onChange={handleChange}
        />
        <FormulaPanel>
          <Formula>{`projected_rate = (observed × n + μ_league × k) / (n + k)

where  k = stabilization_PA × regression_factor`}</Formula>
          <FSection title="Variables">
            <p className="text-xs text-content-secondary"><code className="font-mono">observed</code> — your weighted average from step 1 above</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">n</code> — total weighted PA (larger n = more confidence in the observed rate)</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">μ_league</code> — MLB average for this stat (e.g. BABIP ≈ .299, K% ≈ 22.5%)</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">k</code> — how many "phantom PA" of league-average performance to mix in</p>
          </FSection>
          <FSection title="Stabilization points (from Tom Tango's research)">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`K%     → stabilizes at  60 PA   (fastest — strikeout rate is consistent)
BB%    → stabilizes at 120 PA
ISO    → stabilizes at 250 PA   (power is moderately reliable)
HR/FB% → stabilizes at 300 PA
BABIP  → stabilizes at 820 PA   (slowest — contact luck is very noisy)`}</pre>
            <p className="text-xs text-content-muted mt-1">
              "Stabilizes" means the sample is large enough that observed rate is ~50% signal, 50% noise.
              Your regression_factor multiplies all of these — 2× means you need twice the PA to trust the observed rate.
            </p>
          </FSection>
          <FSection title="Worked example — BABIP .350 with 200 PA, factor = 1.0">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`observed = .350, n = 200, μ_league = .299, k = 820 × 1.0 = 820

projected = (.350 × 200 + .299 × 820) / (200 + 820)
          = (70.0 + 245.18) / 1020
          = 315.18 / 1020
          = .309

The player's .350 gets pulled toward .299 because 200 PA
is far below the 820 needed to trust BABIP. Compare:

factor = 0.5 → k = 410 → projected = .325  (less pull)
factor = 2.0 → k = 1640 → projected = .304  (more pull)`}</pre>
          </FSection>
          <FSection title="Why this matters">
            <p className="text-xs text-content-secondary">
              Regression is the single most important step in projection. Without it, every hot half-season
              would look like a breakout. A player with .380 BABIP in 150 PA is almost certainly going to
              decline — not because they got worse, but because extreme rates require extreme luck to sustain.
              The formula quantifies exactly how much of that .380 to trust.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_engine.rb → regress_to_mean" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* Age curve */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Age Curve</h3>
        <ToggleField
          label="Apply age adjustments"
          hint="Batters peak at ~27, pitchers at ~26. Disabling this treats a 35-year-old the same as a 27-year-old."
          name="age_curve_enabled"
          value={params.age_curve_enabled}
          onChange={handleChange}
        />
        {params.age_curve_enabled && (
          <SliderField
            label="Curve Steepness"
            hint="1× = standard aging curve. 2× = steeper decline for older players. 0.5× = gentler — assumes skills age more gracefully."
            name="age_curve_factor"
            value={params.age_curve_factor}
            min={0.25}
            max={3.0}
            step={0.05}
            onChange={handleChange}
          />
        )}
        <FormulaPanel>
          <Formula>{`adjusted_rate = base_rate × (1 + age_delta × age_curve_factor)

age_delta = per_year_rate × years_from_peak
           (positive before peak = growth, negative after = decline)`}</Formula>
          <FSection title="Age decay rates (batter, peak = age 27)">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`Age 20–26  (pre-peak):   +0.5% per year  ← still improving
Age 27–29  (early decline): −0.5% per year
Age 30–34  (mid decline):   −1.0% per year
Age 35+    (late decline):  −1.5% per year

Speed / SB: peaks at ~23, declines −2.0% per year after
Pitchers:   same shape, peak shifted to age 26`}</pre>
            <p className="text-xs text-content-muted mt-1">
              These rates apply as multipliers to each component independently — power (ISO) and speed decline faster than contact (BB%, K%).
            </p>
          </FSection>
          <FSection title="Worked example — 32-year-old batter, ISO = .180">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`years_from_peak = 32 − 27 = 5
decay = −0.5% × 2yr + −1.0% × 3yr = −4.0% total

age_curve_factor = 1.0:  ISO × (1 − 0.04) = .180 × 0.96 = .173
age_curve_factor = 2.0:  ISO × (1 − 0.08) = .180 × 0.92 = .166  (steeper)
age_curve_factor = 0.5:  ISO × (1 − 0.02) = .180 × 0.98 = .176  (gentler)

The 32-year-old loses 7 points of ISO at 1×, 14 at 2×, 4 at 0.5×.`}</pre>
          </FSection>
          <FSection title="Why this matters">
            <p className="text-xs text-content-secondary">
              Without age adjustments, a career-.280 hitter at age 35 gets the same projection as a career-.280 hitter at age 27. That's wrong — the 35-year-old's skills are actively decaying.
              Increasing steepness is appropriate if you believe modern players age faster (PED era vs. now); decreasing it reflects evidence that some skills (contact, plate discipline) age slowly.
              The curve is applied <em>after</em> regression — so first we figure out the player's true talent, then we project how it will change with age.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_engine.rb → age_multipliers, apply_batter_age_curve" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* Statcast */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Statcast Integration</h3>
        <SliderField
          label="Statcast Weight"
          hint="How much to blend Statcast contact quality (xBA, barrel%) into BABIP and power projections. 0 = pure counting stats. 1 = fully Statcast-driven. Default 0.5."
          name="statcast_weight"
          value={params.statcast_weight}
          min={0}
          max={1}
          step={0.05}
          onChange={handleChange}
        />
        <FormulaPanel>
          <Formula>{`blended_babip = historical_babip × (1 − w) + xBA × w
blended_iso  = historical_iso  × (1 − w) + statcast_power × w

where  w = statcast_weight (your slider)
       xBA = expected batting average (Statcast contact quality model)
       statcast_power = barrel% × power_scalar`}</Formula>
          <FSection title="What xBA and barrel% actually measure">
            <p className="text-xs text-content-secondary mb-1">
              <strong>xBA (expected batting average)</strong> — MLB's Statcast model predicts the probability of a hit for each batted ball based on exit velocity and launch angle, then averages across all contact. Two players with identical traditional AVG but different xBA are expected to diverge: the one with higher xBA was hitting the ball harder and at better angles, but got unlucky.
            </p>
            <p className="text-xs text-content-secondary">
              <strong>Barrel%</strong> — the fraction of batted balls classified as "barrels" (exit velo ≥ 98 mph + optimal launch angle). Barrels have a .900+ slugging percentage. High barrel% translates directly into power — it's the most predictive single metric for ISO going forward.
            </p>
          </FSection>
          <FSection title="Worked example — BABIP blend">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`Player: historical_babip = .310, xBA = .280, w = 0.5

blended = .310 × (1 − 0.5) + .280 × 0.5
        = .155 + .140
        = .295

The gap: xBA says this player is "lucky" — their contact quality
doesn't justify .310. The blend pulls BABIP down to .295.

w = 0.0 → .310  (ignore Statcast, trust counting stats)
w = 1.0 → .280  (fully trust contact quality, ignore history)
w = 0.5 → .295  (equal blend — the default)`}</pre>
          </FSection>
          <FSection title="When to adjust this lever">
            <p className="text-xs text-content-secondary">
              <strong>Increase Statcast weight</strong> for players with short track records (rookies, injury-returning players) where historical counting stats are thin — xBA based on batted-ball data stabilizes faster.
            </p>
            <p className="text-xs text-content-secondary mt-1">
              <strong>Decrease Statcast weight</strong> for contact specialists and slap hitters whose batted-ball profile is intentionally low exit velocity (bunt singles, infield hits) — Statcast penalizes them unfairly since xBA was calibrated on typical swing patterns.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_service.rb → blend" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* Playing time */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Default Playing Time</h3>
        <p className="text-xs text-content-muted -mt-2">
          Used as the playing time assumption for full-season projections when per-player data isn't available.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Default PA (batters)"
            hint="Full healthy season"
            name="default_pa"
            value={params.default_pa}
            min={50} max={700}
            onChange={handleChange}
          />
          <NumberField
            label="Default IP (pitchers)"
            hint="Full healthy season"
            name="default_ip"
            value={params.default_ip}
            min={10} max={250} step={0.5}
            onChange={handleChange}
          />
        </div>
        <FormulaPanel>
          <Formula>{`— Full-season projection —
pa_projected = default_pa   (your input above)

— Rest-of-season projection —
pa_full_pace  = pa_to_date / pct_season_elapsed
pa_remaining  = MIN(pa_full_pace × pct_remaining, default_pa)

where  pct_remaining = 1 − (games_played / 162)
       pa_to_date    = PA accumulated so far this season`}</Formula>
          <FSection title="Why playing time is a separate input">
            <p className="text-xs text-content-secondary">
              Rate stats (AVG, ERA, K%) are independent of playing time. But counting stats (HR, RBI, Ks, W) scale directly with how many PA or IP a player accumulates. A .300 hitter in 200 PA contributes half the counting-stat value of a .300 hitter in 400 PA. Playing time assumptions are essentially a separate projection on top of the rate projection — and they're notoriously hard to forecast (injuries, lineup shuffles, trades).
            </p>
          </FSection>
          <FSection title="Worked example — rest-of-season PA">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`Date: May 15. Games played ≈ 38 of 162.
pct_elapsed  = 38/162 = 23.5%
pct_remaining = 76.5%

Player has 145 PA so far.
pa_full_pace = 145 / 0.235 = 617 PA (projected full-season pace)
pa_remaining = 617 × 0.765 = 472 PA

But default_pa = 550, so:
pa_remaining = MIN(472, 550) = 472 PA

If the player had only 50 PA (injured start to season):
pa_full_pace = 50 / 0.235 = 213 PA  ← below default
pa_remaining = 213 × 0.765 = 163 PA  (reflects reduced pace)`}</pre>
          </FSection>
          <FSection title="The default_pa ceiling and what it means">
            <p className="text-xs text-content-secondary">
              The <code className="font-mono">MIN(..., default_pa)</code> cap prevents RoS projections from inflating
              when a player is hot early and on pace for an unrealistic 700 PA. The cap represents your
              belief about a realistic full-season ceiling — typically 550–600 for everyday starters,
              450–500 for platoon players. For full-season projections, this number <em>is</em> the assumed PA,
              bypassing the pace calculation entirely.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_data_service.rb → remaining_season_context" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* ERA / FIP blend */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">Pitcher ERA Model</h3>
        <SliderField
          label="ERA / FIP Blend"
          hint="0 = pure BABIP-informed ERA (luck-sensitive). 1 = pure FIP (skill-based, ignores BABIP). Default 0.5 blends them equally."
          name="era_fip_blend"
          value={params.era_fip_blend}
          min={0}
          max={1}
          step={0.05}
          onChange={handleChange}
        />
        <FormulaPanel>
          <Formula>{`ERA = babip_ERA × (1 − blend) + FIP × blend

babip_ERA = baserunners_per_inning × 0.32 × 9
FIP       = (13×HR + 3×BB − 2×K) / IP + 3.20`}</Formula>
          <FSection title="Variables">
            <p className="text-xs text-content-secondary"><code className="font-mono">babip_ERA</code> — ERA derived from BABIP, walk rate, and HR rate. Reflects actual results including contact luck.</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">FIP</code> — Fielding Independent Pitching. Uses only outcomes the pitcher controls (K, BB, HR). Ignores whether balls in play became hits.</p>
            <p className="text-xs text-content-secondary"><code className="font-mono">blend</code> — your slider. 0 trusts BABIP results, 1 trusts only pitcher skill metrics.</p>
          </FSection>
          <FSection title="Worked example — same pitcher, BABIP .350 vs .280">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap">{`Pitcher: K%=27%, BB%=8%, HR/FB=11%
FIP = 3.45  (consistent, skill-based)

High-BABIP year (.350): babip_ERA = 4.80
Low-BABIP year (.280):  babip_ERA = 3.10

blend = 0.5:
  High-BABIP season → ERA = 4.80×0.5 + 3.45×0.5 = 4.13
  Low-BABIP season  → ERA = 3.10×0.5 + 3.45×0.5 = 3.28

blend = 1.0 (pure FIP):
  Both seasons → ERA = 3.45  (BABIP luck ignored entirely)

blend = 0.0 (pure BABIP):
  High-BABIP → 4.80, Low-BABIP → 3.10  (full swing preserved)`}</pre>
          </FSection>
          <FSection title="When to adjust">
            <p className="text-xs text-content-secondary">
              <strong>Increase toward FIP</strong> for pitchers with extreme BABIPs — a .360 BABIP is almost certainly bad luck and FIP is a better forward-looking estimate.
            </p>
            <p className="text-xs text-content-secondary mt-1">
              <strong>Decrease toward BABIP</strong> if you believe some pitchers genuinely suppress contact quality in ways FIP doesn't capture (e.g. extreme ground-ball pitchers, or pitchers with elite defense behind them).
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_engine.rb → derive_pitcher_stats" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* History depth */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide">History Depth</h3>
        <p className="text-xs text-content-muted -mt-2">
          How many prior seasons to include, and the minimum sample required for a season to count.
        </p>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-content-primary">Seasons of history</label>
            <span className="font-mono text-sm text-brand font-semibold">{params.history_years}</span>
          </div>
          <p className="text-xs text-content-muted">1 = current season only. 2 = current + 1 prior. 3 = standard (uses all three year weights).</p>
          <input
            type="range"
            min={1} max={3} step={1}
            value={params.history_years}
            onChange={(e) => handleChange('history_years', Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-[10px] text-content-muted">
            <span>1</span><span>2</span><span>3</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="Min PA for batter season"
            hint="Seasons below this threshold are skipped"
            name="min_pa_for_history"
            value={params.min_pa_for_history}
            min={10} max={200} step={10}
            onChange={handleChange}
          />
          <NumberField
            label="Min IP for pitcher season"
            hint="Seasons below this threshold are skipped"
            name="min_ip_for_history"
            value={params.min_ip_for_history}
            min={1} max={50} step={0.5}
            onChange={handleChange}
          />
        </div>

        <FormulaPanel>
          <Formula>{`history = seasons[0..history_years−1].select { |s| s.pa >= min_pa }
weighted_rate = Σ(rateᵢ × PAᵢ × year_weightᵢ) / Σ(PAᵢ × year_weightᵢ)`}</Formula>
          <FSection title="Why fewer seasons can be better">
            <p className="text-xs text-content-secondary">
              A player who changed their swing approach two years ago may have genuinely broken from their prior career trend. Including a third year of stale data pulls the projection back toward an obsolete true-talent level. Setting history_years to 2 with "Recent-heavy" weights captures the shift without completely discarding the extra sample.
            </p>
          </FSection>
          <FSection title="Why the minimum PA threshold matters">
            <p className="text-xs text-content-secondary">
              A season with 15 PA after a May injury is mostly noise. Lowering min_pa to 10–15 includes it (useful for projecting players who are frequently hurt), but it will pull component rates toward an unrepresentative sample. Raising to 100+ effectively requires near-qualifying seasons — useful when you only want signal from full campaigns.
            </p>
          </FSection>
          <FSection>
            <CodeRef path="projection_data_service.rb → batter_history, pitcher_history" />
          </FSection>
        </FormulaPanel>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-bg-border">
        <button
          type="submit"
          disabled={saving || !params.name.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Scenario'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-content-secondary hover:text-content-primary">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function ScenarioBuilder() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios'],
    queryFn: api.scenarios.list,
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (body) => api.scenarios.create(body),
    onSuccess: () => { qc.invalidateQueries(['scenarios']); setCreating(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => api.scenarios.update(id, body),
    onSuccess: () => { qc.invalidateQueries(['scenarios']); setSelected(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.scenarios.destroy(id),
    onSuccess: () => { qc.invalidateQueries(['scenarios']); setDeleteConfirm(null); setSelected(null) },
  })

  const saving = createMutation.isPending || updateMutation.isPending

  function handleSave(params) {
    if (creating) {
      createMutation.mutate(params)
    } else if (selected) {
      updateMutation.mutate({ id: selected.id, body: params })
    }
  }

  const showForm = creating || selected != null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/projections" className="text-content-muted hover:text-content-primary transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-content-primary">Scenarios</h1>
        </div>
        {!showForm && (
          <button
            onClick={() => { setCreating(true); setSelected(null) }}
            className="btn-primary"
          >
            New Scenario
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario list */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-content-muted uppercase tracking-wide px-1">Saved Scenarios</h2>
          {isLoading && <p className="text-sm text-content-muted px-1">Loading…</p>}
          {scenarios.map((s) => (
            <div
              key={s.id}
              className={`card p-3 cursor-pointer transition-all ${
                selected?.id === s.id ? 'ring-2 ring-brand' : 'hover:border-bg-border-strong'
              }`}
              onClick={() => { setSelected(s); setCreating(false) }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-content-primary truncate">{s.name}</span>
                    {s.is_default && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-brand/10 text-brand font-medium">default</span>
                    )}
                  </div>
                  {s.description && <p className="text-xs text-content-muted mt-0.5 line-clamp-2">{s.description}</p>}
                </div>
                {!s.is_default && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(s.id) }}
                    className="shrink-0 text-content-muted hover:text-red-500 transition-colors p-1"
                    title="Delete scenario"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Quick params summary */}
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  `${s.year1_weight}/${s.year2_weight}/${s.year3_weight} yrs`,
                  `${s.regression_factor}× regress`,
                  s.age_curve_enabled ? 'age on' : 'age off',
                  `${Math.round(s.statcast_weight * 100)}% sc`,
                  s.history_years != null && s.history_years !== 3 ? `${s.history_years}yr hist` : null,
                  s.era_fip_blend != null && s.era_fip_blend !== 0.5 ? `FIP ${Math.round(s.era_fip_blend * 100)}%` : null,
                ].filter(Boolean).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border text-content-muted font-mono">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Form panel */}
        <div className="lg:col-span-2">
          {showForm ? (
            <div className="card p-6">
              <h2 className="text-lg font-bold text-content-primary mb-6">
                {creating ? 'New Scenario' : `Edit: ${selected.name}`}
              </h2>
              <ScenarioForm
                initial={creating ? {} : selected}
                onSave={handleSave}
                onCancel={() => { setCreating(false); setSelected(null) }}
                saving={saving}
              />
              {(createMutation.error || updateMutation.error) && (
                <p className="mt-3 text-sm text-red-500">
                  {(createMutation.error || updateMutation.error)?.message}
                </p>
              )}
            </div>
          ) : (
            <div className="card p-10 text-center text-content-muted">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-sm">Select a scenario to edit, or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-content-primary">Delete scenario?</h3>
            <p className="text-sm text-content-muted">
              This will delete the scenario and all cached projections generated with it. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-sm text-content-secondary hover:text-content-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
