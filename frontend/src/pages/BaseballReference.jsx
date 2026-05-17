import { useState, useMemo } from 'react'

const CATEGORIES = [
  { id: 'all',       label: 'All' },
  { id: 'roster',    label: 'Roster Rules' },
  { id: 'contracts', label: 'Contracts & Finance' },
  { id: 'draft',     label: 'Draft & Development' },
  { id: 'ingame',    label: 'In-Game Rules' },
  { id: 'ops',       label: 'Front Office' },
  { id: 'stats',     label: 'Stats & Formulas' },
]

const TERMS = [
  // ── Roster Rules ──────────────────────────────────────────────
  {
    id: 'active-roster',
    term: '26-Man Active Roster',
    abbr: null,
    category: 'roster',
    body: 'The players a team can use in any given game. Teams carry exactly 26 players on the active roster during the regular season (expanded to 28 in September). Every player who appears in a game must be on this list.',
    note: 'Expanded to 28 from Sept 1 through the end of the regular season, giving teams depth for the stretch run.',
  },
  {
    id: '40-man',
    term: '40-Man Roster',
    abbr: null,
    category: 'roster',
    body: 'The full pool of players under contract with the major league club. This includes the 26-man active roster plus players on the 60-day IL, optioned players in the minors, and others. Players must be on the 40-man to be protected from the Rule 5 Draft.',
    note: 'Adding a player to the 40-man is a significant commitment — it starts their service time clock once they reach the majors.',
  },
  {
    id: '10-day-il',
    term: '10-Day Injured List',
    abbr: 'IL-10',
    category: 'roster',
    body: 'A transaction that removes an injured player from the active roster for a minimum of 10 days, freeing a spot. The player continues to count against the 40-man roster and is still paid. Teams use this to shuttle players and manage roster spots.',
    note: null,
  },
  {
    id: '60-day-il',
    term: '60-Day Injured List',
    abbr: 'IL-60',
    category: 'roster',
    body: 'A longer IL designation for players with serious injuries who won\'t return for at least 60 days. The key difference from the 10-day IL: the player is temporarily removed from the 40-man roster, freeing a 40-man spot for another player.',
    note: 'Teams often move players from the 10-day to the 60-day IL to open a 40-man spot mid-season without officially releasing anyone.',
  },
  {
    id: 'option',
    term: 'Minor League Option',
    abbr: 'Option',
    category: 'roster',
    body: 'Each player gets three "option years" after being placed on the 40-man roster. An option allows the team to send the player to the minors without going through waivers. Once a player exhausts their three option years, they must clear waivers to be sent down — making them "out of options."',
    note: 'Players with no options remaining are much harder to move. Teams must either keep them on the active roster, DFA them, or trade them.',
  },
  {
    id: 'dfa',
    term: 'Designated for Assignment',
    abbr: 'DFA',
    category: 'roster',
    body: 'When a player is DFA\'d, they\'re removed from the 40-man roster immediately. The team then has 10 days to trade, release, or outright assign the player to the minors. DFA\'d players with 5+ years of service time can reject an outright assignment and become a free agent.',
    note: 'DFA is often used to clear a 40-man spot quickly — for example, to make room when calling up a prospect who needs to be added to the 40-man.',
  },
  {
    id: 'outright',
    term: 'Outright Assignment',
    abbr: 'Outright',
    category: 'roster',
    body: 'Sending a player to the minors through the waiver wire. If a player clears waivers unclaimed, the team can outright them to a minor league affiliate. Players with 3+ years of MLB service time and a full season in the minors may reject the outright and become free agents.',
    note: null,
  },
  {
    id: 'waivers',
    term: 'Waivers',
    abbr: null,
    category: 'roster',
    body: 'Before a player can be outrighted or released, they must pass through waivers. During the waiver period, other teams can "claim" the player and take over their contract. Claims are prioritized by reverse standings order (worst team gets first pick). The claiming team absorbs the player\'s contract.',
    note: 'Waivers are now largely unconditional — once a player is claimed, the original team can\'t pull them back. Teams use this to gauge trade interest without committing.',
  },
  {
    id: 'roster-construction',
    term: 'Roster Construction',
    abbr: null,
    category: 'roster',
    body: 'How a team builds its 26-man roster — the balance of starters, relievers, position player depth, platoon splits, and bench roles. Modern rosters typically carry 13 pitchers and 13 position players, though teams adjust based on need.',
    note: null,
  },

  // ── Contracts & Finance ───────────────────────────────────────
  {
    id: 'cbt',
    term: 'Competitive Balance Tax',
    abbr: 'CBT / Luxury Tax',
    category: 'contracts',
    body: 'A threshold on total payroll above which teams pay a progressively higher tax rate. The 2024 first threshold is $237M. Teams that repeatedly exceed the threshold face higher rates and additional penalties like reduced draft pick eligibility. Unlike a hard salary cap, teams can still exceed it — they just pay more.',
    note: 'First-time exceeds pay 20% on the overage. Repeat offenders can pay up to 110%. The Yankees and Dodgers routinely pay hundreds of millions in CBT.',
  },
  {
    id: 'pre-arb',
    term: 'Pre-Arbitration',
    abbr: 'Pre-Arb',
    category: 'contracts',
    body: 'Players with fewer than 3 years of MLB service time are pre-arbitration. During this period, teams can pay players as little as the league minimum (~$740K in 2024) regardless of their performance. This is why clubs prioritize developing young talent — they get years of cheap, controlled production.',
    note: 'The new CBA introduced "pre-arb bonuses" — a pool of money distributed to the best-performing pre-arb players each season.',
  },
  {
    id: 'arbitration',
    term: 'Salary Arbitration',
    abbr: 'Arb',
    category: 'contracts',
    body: 'Players with 3–6 years of service time (or "Super Two" players) are eligible for salary arbitration. If the team and player can\'t agree on a salary, an independent panel decides by choosing one of two submitted numbers — the team\'s offer or the player\'s ask. The "file and settle" process means most cases settle before a hearing.',
    note: 'Arbitration creates strong incentives for early extensions — both sides prefer certainty. Most star players sign multi-year extensions before reaching free agency.',
  },
  {
    id: 'super-two',
    term: 'Super Two',
    abbr: 'Super 2',
    category: 'contracts',
    body: 'A special arbitration eligibility status for players with between 2 and 3 years of service time who rank in the top 22% of that group by service days. Super Twos gain an extra year of arbitration (4 years instead of 3), which significantly increases their earning potential before free agency.',
    note: 'Service time manipulation — keeping players in the minors an extra week or two at the start of the year — is often used to avoid Super Two status. The Kris Bryant grievance (2017) is the most famous example.',
  },
  {
    id: 'service-time',
    term: 'Service Time',
    abbr: 'MLS',
    category: 'contracts',
    body: 'Measured in days on the active 25/26-man roster or the major league IL. 172 days = 1 full year of service time. Players need 6 full years to reach free agency. Teams carefully manage service time — especially for top prospects — to control how many years of team control they get.',
    note: 'Kris Bryant, Cody Bellinger, and many others had grievances over service time manipulation. The 2022 CBA added protections and new rules around minimum service time thresholds.',
  },
  {
    id: 'free-agency',
    term: 'Free Agency',
    abbr: 'FA',
    category: 'contracts',
    body: 'Players with 6+ years of MLB service time (or released players) can sign with any team. Free agency opens shortly after the World Series and is the primary mechanism for player movement. Top free agents command multi-year deals worth hundreds of millions.',
    note: null,
  },
  {
    id: 'options-contract',
    term: 'Club / Player / Mutual Option',
    abbr: null,
    category: 'contracts',
    body: 'Contract extensions with optional additional years. A club option lets the team decide whether to exercise it (often with a buyout paid to the player if declined). A player option lets the player decide. A mutual option requires both sides to agree.',
    note: 'Buyouts are paid regardless of whether the option is exercised — they\'re essentially the cost of having the right to decide.',
  },
  {
    id: 'deferred',
    term: 'Deferred Money',
    abbr: null,
    category: 'contracts',
    body: 'Salary that is earned now but paid later — sometimes decades later. Deferred money counts against the CBT at present value, not face value, so teams use it to structure deals that appear larger than their current tax hit. The Dodgers are masters of this structure.',
    note: 'Shohei Ohtani\'s $700M contract defers $680M until after 2034, dropping the immediate CBT hit to ~$46M/year.',
  },
  {
    id: 'ifa',
    term: 'International Bonus Pool',
    abbr: 'IFA / IBP',
    category: 'contracts',
    body: 'Each team has a cap on how much they can spend signing international amateur players (mostly from Latin America and Asia). Teams that exceed their pool face financial penalties and restrictions. Teams can trade pool money to other clubs, creating an active market around bonus pool space.',
    note: null,
  },
  {
    id: 'qualifying-offer',
    term: 'Qualifying Offer',
    abbr: 'QO',
    category: 'contracts',
    body: 'A one-year contract offer — set at the average of the top 125 MLB salaries (~$21.1M in 2024) — that teams can make to departing free agents. If the player rejects it, the signing team loses a draft pick and the original team gains a compensatory pick. Players rarely accept QOs.',
    note: 'The QO system suppresses the market for high-earning free agents because signing teams lose draft capital.',
  },

  // ── Draft & Development ───────────────────────────────────────
  {
    id: 'mlb-draft',
    term: 'MLB Draft (Rule 4 Draft)',
    abbr: null,
    category: 'draft',
    body: 'An annual amateur draft of eligible players from high schools, colleges, and junior colleges in the US, Canada, and Puerto Rico. Held each July. Teams select in reverse order of the previous season\'s standings. Drafted players must sign within a specified window or return to school.',
    note: 'The 2022 CBA moved the draft to July and added a draft lottery for the top picks (similar to the NBA lottery) to reduce tanking incentives.',
  },
  {
    id: 'rule5',
    term: 'Rule 5 Draft',
    abbr: null,
    category: 'draft',
    body: 'A December draft that allows teams to select players who have been in another organization\'s minor league system for a certain number of years without being added to the 40-man roster. The selecting team must keep the player on its 26-man roster for the entire following season or offer him back to the original team for $50K.',
    note: 'This rule prevents teams from hoarding talent in the minors indefinitely. Teams protect their best prospects by adding them to the 40-man before the Rule 5 window opens.',
  },
  {
    id: 'pipeline',
    term: 'Prospect / Pipeline',
    abbr: null,
    category: 'draft',
    body: 'A "prospect" is a player who has not yet exhausted their rookie eligibility (fewer than 130 at-bats, 50 innings pitched, or less than 45 days on the active roster). "Pipeline" refers to an organization\'s collective pool of prospects at all minor league levels.',
    note: 'Prospect rankings by outlets like Baseball America and MLB Pipeline are heavily followed — top-10 overall prospects can drive significant trade value.',
  },
  {
    id: 'minor-league-levels',
    term: 'Minor League Levels',
    abbr: null,
    category: 'draft',
    body: 'The modern minor league system has four affiliated levels: Triple-A (AAA), Double-A (AA), High-A (A+), and Single-A (A). A typical prospect path goes A → A+ → AA → AAA → MLB. Some elite college players skip levels entirely. Teams also have rookie-level and complex-league affiliates for raw prospects.',
    note: null,
  },
  {
    id: 'option-clock',
    term: 'Option Clock',
    abbr: null,
    category: 'draft',
    body: 'Once a player is placed on a team\'s 40-man roster, a clock starts on their three option years. Each time the team sends them to the minors, it counts as using one of those options (regardless of how many times they go up and down that year). When a player uses all three, they\'re "out of options."',
    note: null,
  },
  {
    id: 'international-signing',
    term: 'International Signing Period',
    abbr: null,
    category: 'draft',
    body: 'Unlike domestic amateurs, international prospects (primarily from the Dominican Republic, Venezuela, Cuba, and other countries) are not subject to the Rule 4 Draft. They sign directly with teams during designated signing windows. The IFA bonus pool system caps how much each team can spend.',
    note: 'Dominican and Venezuelan academies are essentially extended scouting and development pipelines. Teams invest heavily in facilities abroad to identify and sign talent early.',
  },

  // ── In-Game Rules ─────────────────────────────────────────────
  {
    id: 'dh',
    term: 'Designated Hitter',
    abbr: 'DH',
    category: 'ingame',
    body: 'A batter who hits in place of the pitcher but does not play a defensive position. The DH has been a universal rule since 2022 (it was AL-only from 1973–2021). Teams use the DH to keep a bat in the lineup that would otherwise be wasted on a pitcher.',
    note: null,
  },
  {
    id: 'shift',
    term: 'Infield Shift',
    abbr: null,
    category: 'ingame',
    body: 'Repositioning infielders to one side of the infield based on a hitter\'s tendencies. Extreme shifts — with three infielders on one side — were banned starting in 2023. The new rule requires two infielders on each side of second base when the pitch is thrown.',
    note: 'The shift ban meaningfully improved batting averages on ground balls for pull-heavy hitters in 2023.',
  },
  {
    id: 'pitch-clock',
    term: 'Pitch Clock',
    abbr: null,
    category: 'ingame',
    body: 'Introduced in 2023: pitchers have 15 seconds to begin their motion with bases empty, 20 seconds with runners on. Batters must be in the box and alert with 8 seconds remaining. Violations result in automatic balls (for pitchers) or automatic strikes (for batters). Average game time dropped by ~25 minutes.',
    note: null,
  },
  {
    id: 'extra-innings',
    term: 'Automatic Runner (Extra Innings)',
    abbr: null,
    category: 'ingame',
    body: 'Since 2020, each extra inning begins with a runner automatically placed on second base (the player who made the last out in the previous inning, or a pinch runner). This dramatically shortens extra-inning games and rewards aggressive situational hitting.',
    note: null,
  },
  {
    id: 'double-switch',
    term: 'Double Switch',
    abbr: null,
    category: 'ingame',
    body: 'A substitution tactic where a manager replaces two players simultaneously, rearranging the batting order to push a newly inserted pitcher\'s spot deeper into the lineup — delaying when they\'ll need to bat. More common in the NL before the universal DH era. Still used occasionally to manage lineup flow.',
    note: null,
  },
  {
    id: 'save',
    term: 'Save',
    abbr: 'SV',
    category: 'ingame',
    body: 'A pitcher records a save when he finishes a game his team wins AND enters with a lead of 3 or fewer runs with at least one out remaining, or enters with the tying run on deck (or on base or at the plate). The save is credited to the closer or the pitcher who finished the game.',
    note: 'The save is a flawed stat — a closer entering with a 3-run lead in the 9th gets the same credit as one who enters with the bases loaded and nobody out in a 1-run game.',
  },
  {
    id: 'balk',
    term: 'Balk',
    abbr: null,
    category: 'ingame',
    body: 'An illegal motion by the pitcher with runners on base. Causes all runners to advance one base. Common balk triggers: starting and stopping a delivery, not stepping toward first base on a pickoff, not coming to a complete stop in the set position.',
    note: null,
  },
  {
    id: 'interference',
    term: 'Interference',
    abbr: null,
    category: 'ingame',
    body: 'When a player (batter, runner, fielder, or fan) impedes another player\'s ability to make a play. Types include: batter\'s interference (hindering the catcher), runner\'s interference (hindering a fielder), obstruction (a fielder impeding a runner without the ball), and fan interference.',
    note: null,
  },

  // ── Front Office / Operations ─────────────────────────────────
  {
    id: 'tanking',
    term: 'Tanking / Rebuild',
    abbr: null,
    category: 'ops',
    body: 'A deliberate strategy of fielding a non-competitive team to accumulate high draft picks, develop prospects, and free up payroll. Teams "tank" for a season or several years with the expectation of a future competitive window. The Astros (2013–2017) are the most famous example of a successful tank-to-contend cycle.',
    note: 'The 2022 CBA introduced the draft lottery for the top picks to reduce tanking incentives, though it hasn\'t eliminated the strategy.',
  },
  {
    id: 'competitive-window',
    term: 'Competitive Window',
    abbr: null,
    category: 'ops',
    body: 'The period during which a team\'s core players are in their prime and under team control at relatively affordable rates, giving the team its best chance to win. Teams try to align free agent acquisitions and extensions with this window.',
    note: null,
  },
  {
    id: 'trade-deadline',
    term: 'Trade Deadline',
    abbr: null,
    category: 'ops',
    body: 'July 31 is the non-waiver trade deadline, after which teams cannot trade players without going through waivers. Contenders typically acquire pieces they need; sellers trade veterans for prospects. The deadline creates one of the most active and narratively rich days of the baseball calendar.',
    note: 'Since 2019, there is only one deadline (July 31). The old August "waiver trade deadline" was eliminated.',
  },
  {
    id: 'payroll',
    term: 'Payroll / Total Payroll',
    abbr: null,
    category: 'ops',
    body: 'The total value of all MLB contract salaries for a given season. For CBT purposes, it includes average annual values (AAV) of multi-year deals plus prorated portions of signing bonuses. The CBT payroll calculation differs from actual cash payroll.',
    note: null,
  },
  {
    id: 'farm-system',
    term: 'Farm System',
    abbr: null,
    category: 'ops',
    body: 'The collection of a team\'s affiliated minor league clubs and the players within them. A deep farm system gives a team trade assets, future stars, and reinforcements. Teams without deep farms are often called "thin" and have limited flexibility in trades.',
    note: null,
  },
  {
    id: 'arbitration-pool',
    term: 'Pre-Arb Bonus Pool',
    abbr: null,
    category: 'ops',
    body: 'Established in the 2022 CBA, this is a pool of money (around $50M annually) distributed to the top-performing pre-arbitration players each year based on performance metrics. It partially addresses the long-standing issue of elite pre-arb players being dramatically underpaid relative to their production.',
    note: null,
  },
  {
    id: 'analytics',
    term: 'Statcast / Analytics Era',
    abbr: null,
    category: 'ops',
    body: 'Since MLB installed Statcast tracking systems in all stadiums in 2015, teams have had access to rich data on every batted ball, pitch, and player movement. The analytics era has reshaped roster construction, pitching strategies, defensive positioning, and player development — making metrics like exit velocity, spin rate, and sprint speed central to evaluation.',
    note: null,
  },
  {
    id: 'arbitration-eligibility',
    term: 'Controlled vs. Free Agent Years',
    abbr: null,
    category: 'ops',
    body: 'When evaluating a player trade, teams count "controlled years" (pre-arb + arb years where the team sets salary) vs. free agent years (where the player can sign anywhere). A player with 4 controlled years is worth significantly more as a trade asset than a player with 1 controlled year, even if they\'re equally talented today.',
    note: null,
  },

  // ── Stats & Formulas ──────────────────────────────────────────
  {
    id: 'mean',
    term: 'Mean (Average)',
    abbr: 'μ',
    category: 'stats',
    body: 'Add all values together and divide by how many there are. Every value participates equally, which means extreme outliers pull it in their direction. When baseball people say "league average," they mean the mean across all qualifying players.',
    formula: 'mean = (x₁ + x₂ + ... + xₙ) / n\n\nExample — BABIP across 5 players:\n(.280 + .295 + .310 + .260 + .420) / 5 = .313\n\nThe .420 outlier drags the mean up 13 points above where four of the five players actually sit.',
    note: 'The mean is the right tool when you want expected value — the average outcome if you could replay the situation many times. It\'s not the most likely individual outcome.',
  },
  {
    id: 'median',
    term: 'Median (Middle Value)',
    abbr: null,
    category: 'stats',
    body: 'Sort all values and take the one in the middle. Extreme outliers have no effect at all — the median only cares about what\'s at the center of the distribution. When data is skewed (as most baseball data is), the median and mean diverge meaningfully.',
    formula: 'Sort values, pick the center one.\nFor even counts, average the two middle values.\n\nSame 5 players sorted: .260, .280, .295, .310, .420\nMedian = .295\n\nThe .420 outlier that moved the mean to .313 has zero effect on the median.',
    note: 'Median is more useful when you want "what will a typical player do" rather than "what is the expected value." Most players underperform the mean projection because means are pulled up by high-upside outcomes.',
  },
  {
    id: 'weighted-average',
    term: 'Weighted Average',
    abbr: null,
    category: 'stats',
    body: 'A mean where some values count more than others. In baseball projections, recent seasons are weighted more heavily than older ones, and larger samples count more than smaller ones. A player hitting .300 in 600 PA should move a projection more than a player hitting .300 in 40 PA.',
    formula: 'weighted_avg = (w₁×x₁ + w₂×x₂ + ... + wₙ×xₙ) / (w₁ + w₂ + ... + wₙ)\n\nMarcel 3-2-1 weighting example for AVG:\n  2024: 500 PA × .295 × 3 = 442.5\n  2023: 400 PA × .280 × 2 = 224.0\n  2022: 200 PA × .310 × 1 =  62.0\n\nweighted_avg = (442.5 + 224.0 + 62.0) / (1500 + 800 + 200)\n             = 728.5 / 2500 = .291',
    note: 'Weighting by PA is what makes this work for rate stats — it prevents a fluky .400 average in 10 at-bats from distorting the projection as much as a true .400 in 500 at-bats.',
  },
  {
    id: 'regression-to-mean',
    term: 'Regression to the Mean',
    abbr: null,
    category: 'stats',
    body: 'The tendency for extreme observed values to move closer to average when measured again. Not because players get worse or better — but because extreme results are partly luck, and luck doesn\'t repeat. A player who hit .380 last year probably won\'t hit .380 again even if their true talent didn\'t change. The projection blends their observed stat with the league average, weighted by how much data we have.',
    formula: 'projected = (observed_stat × sample + league_mean × regression_PA)\n           / (sample + regression_PA)\n\nExample — projecting BABIP (regression_PA ≈ 2000):\n  Player hit .360 BABIP in 400 PA, league mean = .300\n\n  projected = (.360 × 400 + .300 × 2000) / (400 + 2000)\n            = (144 + 600) / 2400\n            = 744 / 2400 = .310\n\nOnly 400 PA of data → pulled heavily toward .300.',
    note: 'With 400 PA the sample barely moves the needle. With 2000+ PA the player\'s observed stat dominates. This is why we trust a full season\'s BABIP more than a hot April.',
  },
  {
    id: 'regression-amounts',
    term: 'Regression Amounts by Stat',
    abbr: null,
    category: 'stats',
    body: 'Different stats have different amounts of variance — some are mostly skill, some are mostly noise. High-variance stats need heavy regression (the league mean dominates until you have a huge sample). Low-variance stats stabilize quickly and need less regression. The regression_PA in the formula above is just an approximation of how many PA you need before the stat is more signal than noise.',
    formula: 'Approximate regression PA by stat:\n\n  BABIP      ~2000 PA  ← mostly luck, regress hard\n  HR rate    ~1200 PA\n  wOBA       ~  600 PA\n  ISO        ~  500 PA\n  OBP        ~  450 PA\n  BB%        ~  400 PA\n  K%         ~  300 PA  ← mostly skill, stabilizes fast\n  AVG        ~  550 PA\n\nA stat\'s regression_PA ≈ the sample where observed\nperformance explains ~50% of future performance.',
    note: 'K% stabilizes fast because strikeouts are almost entirely contact-skill — pitchers and batters both repeat them reliably. BABIP stabilizes slowly because defense, park, batted-ball luck all contaminate it.',
  },
  {
    id: 'standard-deviation',
    term: 'Standard Deviation',
    abbr: 'SD / σ',
    category: 'stats',
    body: 'Measures how spread out values are around the mean. A small SD means most players cluster near the average. A large SD means performance is spread across a wide range. Stats with high SD have more variance and generally need more regression — the distribution is too wide to trust small samples.',
    formula: 'σ = √[ Σ(xᵢ - mean)² / n ]\n\nIn plain english: find how far each value is from\nthe mean, square those distances, average them,\nthen take the square root.\n\nExample — BABIP σ across MLB ≈ .030\nExample — K% σ across MLB ≈ .040\n\nSimilar spread, but BABIP is noisier because more\nof its variance is random rather than skill-driven.',
    note: 'One SD above average in wOBA is roughly the difference between a replacement-level hitter and an All-Star. Understanding SD helps calibrate how unusual a performance actually is.',
  },
  {
    id: 'age-curve',
    term: 'Age Curve Adjustment',
    abbr: null,
    category: 'stats',
    body: 'Players don\'t perform the same at every age. The aggregate pattern across MLB history shows improvement through the mid-20s, a peak around 27–28, and gradual decline after. Projection systems apply a multiplier to the regressed weighted average to account for where in this curve the player currently sits.',
    formula: 'projected_stat = regressed_stat × age_factor\n\nApproximate age factors for offensive rate stats:\n  Age 22: × 1.04  (+4% vs. peak)\n  Age 24: × 1.02\n  Age 26: × 1.01\n  Age 28: × 1.00  (peak)\n  Age 30: × 0.98\n  Age 32: × 0.96\n  Age 34: × 0.93\n  Age 36: × 0.88\n\nFactors vary by skill type — speed declines earlier\nthan power; plate discipline holds longest.',
    note: 'Age curves are averages — individual players deviate significantly. A 35-year-old with exceptional conditioning might outperform his age factor while a 26-year-old recovering from a serious injury might underperform his.',
  },
  {
    id: 'park-factor',
    term: 'Park Factor',
    abbr: 'PF',
    category: 'stats',
    body: 'A multiplier expressing how much a given ballpark inflates or suppresses offense (or a specific stat) relative to a neutral environment. Coors Field has an extreme positive park factor for offense; Petco Park has a depressive one. Before projecting, raw stats are converted to park-neutral rates, then re-applied with the player\'s projected home park.',
    formula: 'park_factor = (runs_at_home / games_home)\n            / (runs_at_away / games_away)\n\nNeutralizing a stat:\n  neutral_stat = raw_stat / park_factor\n\nRe-applying for projection:\n  projected_stat = neutral_projected × new_park_factor\n\nExample — converting a .320 BABIP from Coors (PF ≈ 1.15)\nto a neutral environment:\n  neutral = .320 / 1.15 = .278',
    note: 'Park factors are typically averaged over 3 years to reduce year-to-year noise. A player moving from Coors to Petco mid-career will see their raw numbers drop even if their true talent is unchanged.',
  },
  {
    id: 'rmse',
    term: 'Root Mean Squared Error',
    abbr: 'RMSE',
    category: 'stats',
    body: 'The standard way to measure how accurate a projection system is. You project a season, wait for it to happen, then measure the average size of your errors. Lower RMSE = better projections. Systems are validated by projecting a historical season using only data prior to it, then comparing to what actually happened.',
    formula: 'RMSE = √[ Σ(projected - actual)² / n ]\n\nExample — projecting wOBA for 100 players:\n  If the average squared error is .0009,\n  RMSE = √.0009 = .030\n\nThat means projections were off by ~30 points\nof wOBA on average.\n\nContext: a .030 wOBA difference ≈ the gap between\nan average hitter and a solid regular.',
    note: 'RMSE penalizes large errors more than small ones (because of the squaring). A system that\'s slightly wrong about everyone beats one that\'s mostly right but catastrophically wrong about a few players.',
  },
]

function highlight(text, query) {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-brand/20 text-brand rounded-sm px-0.5">{part}</mark>
      : part
  )
}

function TermCard({ term, abbr, body, formula, note, query, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-elevated/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-content-primary">{highlight(term, query)}</span>
          {abbr && (
            <span className="text-[11px] font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded shrink-0">{abbr}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-content-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-bg-border/40">
          <p className="text-[13px] text-content-secondary leading-relaxed pt-3">{highlight(body, query)}</p>
          {formula && (
            <pre className="text-[11px] font-mono text-content-secondary bg-bg-base rounded-md px-3 py-2.5 overflow-x-auto leading-relaxed whitespace-pre mt-1">
              {formula}
            </pre>
          )}
          {note && (
            <div className="flex gap-2 mt-2 bg-bg-elevated rounded-md px-3 py-2">
              <span className="text-brand text-[11px] font-bold uppercase tracking-wider shrink-0 mt-0.5">Note</span>
              <p className="text-[12px] text-content-muted leading-relaxed">{highlight(note, query)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BaseballReference() {
  const [query, setQuery]   = useState('')
  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => {
    const q   = query.trim().toLowerCase()
    const cat = category === 'all' ? null : category
    return TERMS.filter(t => {
      const inCat = !cat || t.category === cat
      if (!q) return inCat
      const searchable = [t.term, t.abbr || '', t.body, t.note || ''].join(' ').toLowerCase()
      return inCat && searchable.includes(q)
    })
  }, [query, category])

  const grouped = useMemo(() => {
    if (category !== 'all' || query) return null
    return CATEGORIES.slice(1).map(cat => ({
      ...cat,
      terms: TERMS.filter(t => t.category === cat.id),
    }))
  }, [category, query])

  const isSearching = query.trim().length > 0 || category !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-content-primary tracking-tight">Baseball Reference</h1>
        <p className="text-sm text-content-muted mt-1">Roster rules, contracts, the draft, in-game rules, and front office operations — explained.</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search terms…"
            className="w-full bg-bg-surface border border-bg-border rounded-md pl-9 pr-3 py-2 text-sm text-content-primary placeholder-content-muted outline-none focus:border-brand transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`text-[12px] px-3 py-1.5 rounded-md font-medium transition-colors ${
                category === cat.id
                  ? 'bg-brand text-white'
                  : 'text-content-muted hover:text-content-secondary bg-bg-surface border border-bg-border'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {isSearching ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-content-muted text-sm">
              No terms match "{query}"
            </div>
          ) : (
            <>
              <p className="text-[11px] text-content-muted">{filtered.length} {filtered.length === 1 ? 'term' : 'terms'}</p>
              {filtered.map(t => (
                <TermCard key={t.id} {...t} query={query} defaultOpen={true} />
              ))}
            </>
          )}
        </div>
      ) : (
        /* Grouped view */
        <div className="space-y-8">
          {grouped?.map(cat => (
            <section key={cat.id}>
              <h2 className="text-[11px] font-semibold text-content-muted uppercase tracking-[0.08em] mb-3">{cat.label}</h2>
              <div className="space-y-2">
                {cat.terms.map(t => (
                  <TermCard key={t.id} {...t} query="" defaultOpen={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
