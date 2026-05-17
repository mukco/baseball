const STAT_HELP = {
  avg: {
    label: 'AVG',
    definition: 'Batting average is how often a batter records a hit per at-bat.',
    formula: 'Hits / at-bats.',
    formulaLatex: '\\mathrm{AVG}=\\frac{H}{AB}',
    interpretation: 'Higher is better for hitters.',
    intuition: 'Think of it as hits per at-bat — .300 means 3 hits every 10 ABs.'
  },
  obp: {
    label: 'OBP',
    definition: 'On-base percentage measures how often a batter reaches base.',
    formula: '(H + BB + HBP) / (AB + BB + HBP + SF).',
    formulaLatex: '\\mathrm{OBP}=\\frac{H+BB+HBP}{AB+BB+HBP+SF}',
    interpretation: 'Higher is better for hitters.',
    intuition: 'Think of it as how often a batter reaches base — .400 means reaching 4 out of every 10 PAs.'
  },
  slg: {
    label: 'SLG',
    definition: 'Slugging percentage captures power by weighting extra-base hits.',
    formula: 'Total bases / at-bats.',
    formulaLatex: '\\mathrm{SLG}=\\frac{TB}{AB}',
    interpretation: 'Higher is better for hitters.',
    intuition: 'Think of it as how many bases per at-bat — .500 means one total base every two ABs.'
  },
  ops: {
    label: 'OPS',
    definition: 'OPS combines on-base skill and slugging into one quick metric.',
    formula: 'OBP + SLG.',
    formulaLatex: '\\mathrm{OPS}=\\mathrm{OBP}+\\mathrm{SLG}',
    interpretation: 'Higher is better for hitters.',
    intuition: 'Think of it as a single number that rewards both getting on base and hitting for power — .800+ is good, .900+ is great.'
  },
  homeRuns: {
    label: 'HR',
    definition: 'Home runs hit by a batter or allowed by a pitcher, depending on context.',
    formula: 'Count of home run events.',
    interpretation: 'For hitters higher is better; for pitchers lower allowed is better.',
    intuition: 'Think of it as how many times a batter hits it out — 30+ is typically elite power.'
  },
  rbi: {
    label: 'RBI',
    definition: 'Runs Batted In counts runs scored directly from a batter\'s plate appearance.',
    formula: 'Official RBI scoring by MLB rules.',
    interpretation: 'Higher is better, with lineup context effects.',
    intuition: 'Think of it as runs a batter drives in — heavily dependent on who bats before them.'
  },
  stolenBases: {
    label: 'SB',
    definition: 'Stolen bases recorded by a runner.',
    formula: 'Count of successful stolen-base attempts.',
    interpretation: 'Higher is generally better for speed impact.',
    intuition: 'Think of it as how often a player successfully steals — volume depends on opportunity.'
  },
  strikeouts: {
    label: 'K',
    definition: 'Strikeouts recorded by a batter (times struck out) or pitcher (batters struck out).',
    formula: 'Count of strikeout events.',
    interpretation: 'For hitters lower is better; for pitchers higher is better.',
    intuition: 'Think of it as a whiff count — hitters want fewer, pitchers want more.'
  },
  walks: {
    label: 'BB',
    definition: 'Base on balls drawn by hitters or issued by pitchers.',
    formula: 'Count of walk events.',
    interpretation: 'For hitters higher can be good; for pitchers lower is better.',
    intuition: 'Think of it as patience at the plate for hitters, or control issues for pitchers.'
  },
  gamesPlayed: {
    label: 'G',
    definition: 'Total games appeared in during the selected sample.',
    formula: 'Count of game appearances.',
    interpretation: 'Volume/context stat; not a pure quality metric.',
    intuition: 'Think of it as availability — games played gives context for other counting stats.'
  },
  plateAppearances: {
    label: 'PA',
    definition: 'Total batting opportunities, including outcomes that are not official at-bats.',
    formula: 'Official PA tally by scorekeeping rules.',
    interpretation: 'Volume stat; useful for sample size and qualification.',
    intuition: 'Think of it as total trips to the plate — 600 PA is a full regular season.'
  },
  inningsPitched: {
    label: 'IP',
    definition: 'Innings pitched by a pitcher.',
    formula: 'Outs recorded / 3.',
    formulaLatex: '\\mathrm{IP}=\\frac{\\mathrm{Outs}}{3}',
    interpretation: 'Volume and workload indicator.',
    intuition: 'Think of it as outs-based workload — 200 IP is a full season for a starter.'
  },
  wins: {
    label: 'W',
    definition: 'Pitcher wins awarded by official scoring rules.',
    formula: 'Count of credited wins.',
    interpretation: 'Context-heavy; team support strongly affects this stat.',
    intuition: 'Think of it as a team-context stat — a great pitcher on a bad team may have few wins.'
  },
  losses: {
    label: 'L',
    definition: 'Pitcher losses assigned by official scoring rules.',
    formula: 'Count of credited losses.',
    interpretation: 'Lower is generally better, but heavily context-driven.',
    intuition: 'Think of it as a team-context stat — even great pitchers can take a loss.'
  },
  saves: {
    label: 'SV',
    definition: 'Saves credited to relief pitchers who finish games in qualifying situations.',
    formula: 'Official save rule criteria.',
    interpretation: 'Role-dependent counting stat.',
    intuition: 'Think of it as games successfully closed — closer role stat.'
  },
  wrcPlus: {
    label: 'wRC+',
    definition: 'Weighted Runs Created Plus adjusts offensive value for park and league context.',
    formula: 'Scaled to league average = 100.',
    interpretation: 'Higher is better; 120 means 20% better than league average.',
    intuition: 'Think of it as a percentage relative to league average — 120 is 20% better than average, 80 is 20% worse.'
  },
  war: {
    label: 'WAR',
    definition: 'Wins Above Replacement estimates total value versus a readily available replacement player.',
    formula: 'Batting + baserunning + fielding + positional + pitching adjustments.',
    interpretation: 'Higher is better; around 2 is solid, 5+ is All-Star level.',
    intuition: 'Think of it as total wins added above a replacement-level player — 2 is a solid starter, 5 is a star, 8 is MVP-caliber.'
  },
  woba: {
    label: 'wOBA',
    definition: 'Weighted On-Base Average values each batting event by its run impact.',
    formula: 'Weighted sum of BB/HBP/1B/2B/3B/HR divided by plate appearance-like denominator.',
    formulaLatex: '\\mathrm{wOBA}=\\frac{w_{BB}\\cdot BB+w_{HBP}\\cdot HBP+w_{1B}\\cdot 1B+w_{2B}\\cdot 2B+w_{3B}\\cdot 3B+w_{HR}\\cdot HR}{AB+BB-IBB+SF+HBP}',
    interpretation: 'Higher is better; roughly .320 is average in many seasons.',
    intuition: 'Think of it as batting average that properly rewards doubles and homers — .400 is elite.'
  },
  xwoba: {
    label: 'xwOBA',
    definition: 'Expected wOBA estimated from quality of contact and strikeout/walk events.',
    formula: 'Statcast model using exit velocity, launch angle, and event outcomes.',
    interpretation: 'Higher is better; useful for separating skill from short-term luck.',
    intuition: 'Think of it as wOBA without the luck — based on how hard the ball was hit, not where it landed.'
  },
  xba: {
    label: 'xBA',
    definition: 'Expected batting average from Statcast contact quality.',
    formula: 'Model-based hit probability from batted-ball inputs.',
    intuition: `Think of it as what a hitter's AVG should be based on contact quality — if xBA is higher than AVG, they've been unlucky.`
  },
  hardHitPct: {
    label: 'Hard Hit%',
    definition: 'Share of batted balls hit at 95+ mph exit velocity.',
    formula: 'Hard-hit balls / batted balls.',
    formulaLatex: '\\mathrm{HardHit\\%}=\\frac{\\mathrm{HardHitBalls}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for hitters.',
    intuition: 'Think of it as how often a batter barrels it at 95+ mph — shows raw authority.'
  },
  barrelPct: {
    label: 'Barrel%',
    definition: 'Rate of batted balls in an exit-velocity and launch-angle sweet zone tied to damage.',
    formula: 'Barrels / batted balls.',
    formulaLatex: '\\mathrm{Barrel\\%}=\\frac{\\mathrm{Barrels}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for hitters.',
    intuition: 'Think of it as the share of swings where the batter absolutely crushed it — barrels produce .800+ AVG and tons of power.'
  },
  launchAngle: {
    label: 'Launch Angle',
    definition: 'Average vertical angle of batted balls off the bat.',
    formula: 'Mean launch angle in degrees.',
    interpretation: 'Context-dependent; extreme low/high angles can limit production.',
    intuition: 'Think of it as the trajectory off the bat — 10-25° is the damage sweet spot, low means grounders, high means pop-ups.'
  },
  sweetSpotPct: {
    label: 'Sweet Spot%',
    definition: 'Share of batted balls in the optimal launch-angle window.',
    formula: 'Sweet-spot batted balls / batted balls.',
    formulaLatex: '\\mathrm{SweetSpot\\%}=\\frac{\\mathrm{SweetSpotBalls}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for quality contact.',
    intuition: 'Think of it as how often a batter finds the ideal launch window for hard contact — 8-32° is the sweet spot.'
  },
  sprintSpeed: {
    label: 'Sprint Speed',
    definition: 'Statcast measure of running speed in feet per second on top-effort runs.',
    formula: "Average of a player's fastest tracked one-second windows.",
    interpretation: 'Higher is better for speed and baserunning impact.',
    intuition: 'Think of it as top-end running speed — 30 ft/s is elite, 27 is average.'
  },
  babip: {
    label: 'BABIP',
    definition: 'Batting Average on Balls in Play measures hit rate on non-HR balls put in play.',
    formula: '(H - HR) / (AB - K - HR + SF).',
    formulaLatex: '\\mathrm{BABIP}=\\frac{H-HR}{AB-K-HR+SF}',
    interpretation: 'Context-dependent; extremes often regress toward player/team baseline.',
    intuition: 'Think of it as batting average excluding homers and strikeouts — .300 is normal, way above or below usually regresses.'
  },
  kPct: {
    label: 'K%',
    definition: 'Strikeout rate as a share of plate appearances (or batters faced for pitchers).',
    formula: 'Strikeouts / opportunities.',
    formulaLatex: '\\mathrm{K\\%}=\\frac{K}{\\mathrm{Opportunities}}',
    intuition: `Think of it as whiff rate — for hitters it's what you avoid, for pitchers it's what you aim for.`
  },
  bbPct: {
    label: 'BB%',
    definition: 'Walk rate as a share of plate appearances (or batters faced for pitchers).',
    formula: 'Walks / opportunities.',
    formulaLatex: '\\mathrm{BB\\%}=\\frac{BB}{\\mathrm{Opportunities}}',
    interpretation: 'For hitters higher is usually better; for pitchers lower is better.',
    intuition: 'Think of it as patience (for hitters) or control issues (for pitchers).'
  },
  kMinusBbPct: {
    label: 'K-BB%',
    definition: 'Difference between strikeout rate and walk rate.',
    formula: 'K% - BB%.',
    formulaLatex: '\\mathrm{K-BB\\%}=\\mathrm{K\\%}-\\mathrm{BB\\%}',
    intuition: `Think of it as a pitcher's net dominance — how many batters they overpower vs let on for free.`
  },
  fip: {
    label: 'FIP',
    definition: 'Fielding Independent Pitching estimates pitcher run prevention from K, BB, HBP, and HR.',
    formula: '((13*HR + 3*(BB+HBP) - 2*K) / IP) + constant.',
    formulaLatex: '\\mathrm{FIP}=\\frac{13\\cdot HR+3\\cdot(BB+HBP)-2\\cdot K}{IP}+C',
    intuition: `Think of it as what a pitcher's ERA should be if defense were average — only Ks, walks, and homers matter.`
  },
  xfip: {
    label: 'xFIP',
    definition: 'Expected FIP replaces HR outcomes with expected HR from fly-ball profile.',
    formula: 'FIP-style equation using expected HR component.',
    interpretation: 'Lower is better; smooths noisy year-to-year HR swings.',
    intuition: 'Think of it as FIP that normalizes home run luck — uses expected HR rate instead of actual.'
  },
  kPer9: {
    label: 'K/9',
    definition: 'Strikeouts recorded per nine innings pitched.',
    formula: '(Strikeouts / innings pitched) * 9.',
    formulaLatex: '\\mathrm{K/9}=\\frac{K}{IP}\\cdot 9',
    interpretation: 'Higher is better for pitchers.',
    intuition: 'Think of it as strikeouts per full game — 10 K/9 means a starter would get 10 Ks over 9 innings.'
  },
  bbPer9: {
    label: 'BB/9',
    definition: 'Walks allowed per nine innings pitched.',
    formula: '(Walks / innings pitched) * 9.',
    formulaLatex: '\\mathrm{BB/9}=\\frac{BB}{IP}\\cdot 9',
    interpretation: 'Lower is better for pitchers.',
    intuition: 'Think of it as walks per full game — 2 BB/9 is excellent control.'
  },
  cswPct: {
    label: 'CSW%',
    definition: 'Called Strikes plus Whiffs rate, a pitch-level command and bat-miss indicator.',
    formula: '(Called strikes + swinging strikes) / total pitches.',
    formulaLatex: '\\mathrm{CSW\\%}=\\frac{\\mathrm{CalledStrikes}+\\mathrm{Whiffs}}{\\mathrm{TotalPitches}}',
    interpretation: 'Higher is better for pitchers.',
    intuition: 'Think of it as how often a pitcher gets a favorable result — either a called strike or a swing-and-miss.'
  },
  gbPct: {
    label: 'GB%',
    definition: 'Ground-ball rate, the share of batted balls hit on the ground.',
    formula: 'Ground balls / balls in play.',
    formulaLatex: '\\mathrm{GB\\%}=\\frac{GB}{BIP}',
    interpretation: 'Context-dependent; can support run prevention when paired with command.',
    intuition: 'Think of it as how often a pitcher induces grounders — higher GB% means weak contact on the ground.'
  },
  era: {
    label: 'ERA',
    definition: 'Earned Run Average estimates earned runs allowed per nine innings.',
    formula: '(Earned runs / innings pitched) * 9.',
    formulaLatex: '\\mathrm{ERA}=\\frac{ER}{IP}\\cdot 9',
    interpretation: 'Lower is better for pitchers.',
    intuition: 'Think of it as how many runs a pitcher would give up over a full game — 3.00 means 3 runs per 9 innings.'
  },
  whip: {
    label: 'WHIP',
    definition: 'Walks and Hits per Inning Pitched tracks baserunners allowed.',
    formula: '(Walks + hits) / innings pitched.',
    formulaLatex: '\\mathrm{WHIP}=\\frac{BB+H}{IP}',
    interpretation: 'Lower is better for pitchers.',
    intuition: 'Think of it as baserunners allowed per inning — 1.00 means 1 runner per inning, elite.'
  },
  exitVelo: {
    label: 'Exit Velo',
    definition: 'Average speed of batted balls off the bat.',
    formula: 'Mean exit velocity in mph.',
    interpretation: 'Higher is generally better for quality of contact.',
    intuition: 'Think of it as how hard a batter hits the ball — 90+ mph is strong contact.'
  },
  maxExitVelo: {
    label: 'Max EV',
    definition: 'Maximum recorded exit velocity in the selected sample.',
    formula: 'Highest single batted-ball exit velocity.',
    intuition: `Think of it as a batter's raw power ceiling — how hard they can hit a ball at their absolute best.`
  },
  spinRate: {
    label: 'Spin',
    definition: 'Pitch spin rate in revolutions per minute.',
    formula: 'Average rpm for the pitch type/sample.',
    interpretation: 'Context-dependent; value varies by pitch type and shape.',
    intuition: 'Think of it as how much rotation a pitcher puts on the ball — more spin generally means more movement.'
  },
  velocity: {
    label: 'Velo',
    definition: 'Pitch velocity, typically measured in miles per hour.',
    formula: 'Average release speed in mph.',
    interpretation: 'Higher can improve stuff, but command and shape still matter.',
    intuition: 'Think of it as raw heat — 95+ mph is the top tier for fastballs.'
  },
  horizontalBreak: {
    label: 'H-Break',
    definition: 'Horizontal movement of a pitch relative to a spinless trajectory.',
    formula: 'Average horizontal break in inches.',
    interpretation: 'Descriptive movement stat; effectiveness depends on shape and mix.',
    intuition: 'Think of it as side-to-side movement — a good slider might have 5+ inches of horizontal break.'
  },
  verticalBreak: {
    label: 'V-Break',
    definition: 'Vertical movement of a pitch relative to a spinless trajectory.',
    formula: 'Average induced vertical break in inches.',
    interpretation: 'Descriptive movement stat; effectiveness depends on pitch design.',
    intuition: 'Think of it as vertical drop or rise — a sinker drops, high spin causes a "rising" fastball effect.'
  },
  whiffPct: {
    label: 'Whiff%',
    definition: 'Rate of swings that miss.',
    formula: 'Swinging strikes / swings.',
    formulaLatex: '\\mathrm{Whiff\\%}=\\frac{\\mathrm{SwingingStrikes}}{\\mathrm{Swings}}',
    interpretation: 'Higher is better for bat-miss ability.',
    intuition: 'Think of it as miss rate per swing — how often a batter swings and misses.'
  },
  gamesStarted: {
    label: 'GS',
    definition: 'Games started by a pitcher.',
    formula: 'Count of starts.',
    interpretation: 'Role/workload indicator rather than pure performance metric.',
    intuition: 'Think of it as how many times a pitcher started a game — 32+ starts is a full season.'
  },
  fieldingPct: {
    label: 'Fielding%',
    definition: 'Share of defensive chances converted without an error.',
    formula: '(Putouts + assists) / total chances.',
    formulaLatex: '\\mathrm{Fielding\\%}=\\frac{PO+A}{TC}',
    interpretation: 'Higher is better, though range is not captured directly.',
    intuition: 'Think of it as reliability — .990 means 99% of chances handled without error.'
  },
  errors: {
    label: 'Errors',
    definition: 'Officially scored defensive misplays that let a batter/runner advance.',
    formula: 'Count of charged errors.',
    interpretation: 'Lower is better for defenders.',
    intuition: 'Think of it as defensive mistakes — fewer is better for helping the pitcher.'
  },
  putouts: {
    label: 'Putouts',
    definition: 'Defensive plays where the fielder records an out directly.',
    formula: 'Count of putout events.',
    interpretation: 'Context and position dependent volume stat.',
    intuition: 'Think of it as outs directly recorded — first basemen and catchers tend to rack these up.'
  },
  assists: {
    label: 'Assists',
    definition: 'Defensive plays where the fielder helps record an out.',
    formula: 'Count of assist events.',
    interpretation: 'Context and position dependent volume stat.',
    intuition: 'Think of it as helping get someone out — middle infielders get lots of these on grounders and double plays.'
  },
  doublePlays: {
    label: 'Double Plays',
    definition: 'Plays where two outs are recorded on the same action sequence.',
    formula: 'Count of credited double plays.',
    interpretation: 'Context and opportunity dependent volume stat.',
    intuition: 'Think of it as turning two — pitchers induce them, infielders execute them.'
  },
  inningsFielding: {
    label: 'Innings',
    definition: 'Defensive innings played at fielding positions.',
    formula: 'Outs on defense / 3.',
    formulaLatex: '\\mathrm{Innings}=\\frac{\\mathrm{DefensiveOuts}}{3}',
    interpretation: 'Workload/usage indicator.',
    intuition: 'Think of it as time spent in the field — more innings means more defensive responsibility.'
  },
  disciplineEdge: {
    label: 'Discipline Edge',
    definition: 'Difference in strikeout-minus-walk profile between one team and the opponent.',
    formula: 'Opponent K-BB% - Team K-BB%.',
    formulaLatex: '\\mathrm{DisciplineEdge}=\\left(\\mathrm{K\\%-BB\\%}\\right)_{opp}-\\left(\\mathrm{K\\%-BB\\%}\\right)_{team}',
    interpretation: 'Positive value favors the displayed team in plate-discipline profile.',
    intuition: 'Think of it as the plate-discipline advantage — positive means the team has better command of the strike zone.'
  },
  runPreventionEdge: {
    label: 'Run Prevention Edge',
    definition: 'Gap in fielding-independent run prevention between teams.',
    formula: 'Opponent FIP - Team FIP.',
    formulaLatex: '\\mathrm{RunPreventionEdge}=\\mathrm{FIP}_{opp}-\\mathrm{FIP}_{team}',
    interpretation: 'Positive value favors the displayed team in expected run prevention.',
    intuition: `Think of it as the expected run prevention advantage — positive means the team's pitching FIP is better.`
  },
  contactQualityEdge: {
    label: 'Contact Quality Edge',
    definition: 'Difference in contact-quality metrics between teams (Statcast-dependent).',
    formula: 'Composite contact quality (team) - composite contact quality (opponent).',
    interpretation: 'Positive value favors the displayed team; may be unavailable when Statcast inputs are missing.',
    intuition: 'Think of it as the hard-hit advantage — positive means the team makes better contact than the opponent.'
  },
  siera: {
    label: 'SIERA',
    definition: 'Skill-Interactive ERA is a park-adjusted ERA estimator that uses strikeout rate, walk rate, and batted-ball mix to model true run prevention skill.',
    formula: 'Proprietary weighted formula using K%, BB%, GB%, FB%, and interaction terms.',
    interpretation: 'Lower is better for pitchers; more predictive than ERA, FIP, or xFIP.',
    intuition: 'Think of it as the most complete ERA estimator — it rewards strikeouts, penalises walks, and factors in whether a pitcher induces grounders or fly balls.'
  },
  iso: {
    label: 'ISO',
    definition: 'Isolated Power measures raw extra-base hit ability by removing singles from slugging.',
    formula: 'SLG - AVG.',
    formulaLatex: '\\mathrm{ISO}=\\mathrm{SLG}-\\mathrm{AVG}',
    interpretation: 'Higher is better for hitters.',
    intuition: 'Think of it as pure power — .200+ is elite slugger territory, .150 is solid, below .100 is a contact-only hitter.'
  },
  ldPct: {
    label: 'LD%',
    definition: 'Line-drive rate is the share of batted balls classified as line drives.',
    formula: 'Line drives / balls in play.',
    formulaLatex: '\\mathrm{LD\\%}=\\frac{\\mathrm{LineDrives}}{\\mathrm{BIP}}',
    interpretation: 'Higher is generally better for hitters; correlates with BABIP.',
    intuition: 'Think of it as how often a batter ropes it — line drives fall for hits far more than fly balls or grounders.'
  },
  fbPct: {
    label: 'FB%',
    definition: 'Fly-ball rate is the share of batted balls classified as fly balls.',
    formula: 'Fly balls / balls in play.',
    formulaLatex: '\\mathrm{FB\\%}=\\frac{\\mathrm{FlyBalls}}{\\mathrm{BIP}}',
    interpretation: 'Context-dependent; high FB% amplifies HR output but also pop-ups.',
    intuition: 'Think of it as how often a batter lifts the ball — paired with hard contact it drives HRs, but alone it can mean pop-ups.'
  },
  hrFbPct: {
    label: 'HR/FB%',
    definition: 'Home run to fly-ball rate measures how often a fly ball results in a home run.',
    formula: 'Home runs / fly balls.',
    formulaLatex: '\\mathrm{HR/FB}=\\frac{HR}{\\mathrm{FlyBalls}}',
    interpretation: 'Higher is better for hitters; tends to regress toward a player baseline over time.',
    intuition: 'Think of it as power efficiency on contact — 15%+ is elite, extreme values in either direction tend to regress.'
  },
  oSwingPct: {
    label: 'O-Swing%',
    definition: 'Chase rate — the percentage of pitches outside the strike zone that a batter swings at.',
    formula: 'Swings on pitches outside zone / pitches outside zone.',
    formulaLatex: '\\mathrm{O\\text{-}Swing}=\\frac{\\text{Swings}_{\\mathrm{out}}}{\\text{Pitches}_{\\mathrm{out}}}',
    interpretation: 'Lower is better for hitters. League average is ~30%; elite plate discipline is under 25%.',
    intuition: 'The most direct measure of discipline — how often does a batter chase pitches he can\'t drive? High chase rates are difficult to compensate for.'
  },
  zSwingPct: {
    label: 'Z-Swing%',
    definition: 'Zone swing rate — the percentage of pitches inside the strike zone that a batter swings at.',
    formula: 'Swings on pitches inside zone / pitches inside zone.',
    formulaLatex: '\\mathrm{Z\\text{-}Swing}=\\frac{\\text{Swings}_{\\mathrm{in}}}{\\text{Pitches}_{\\mathrm{in}}}',
    interpretation: 'Higher is generally better — passively taking strikes hurts. League average is ~68%.',
    intuition: 'Complements O-Swing%: the ideal hitter swings at strikes (high Z-Swing%) and lays off balls (low O-Swing%).'
  },
  batSpeed: {
    label: 'Bat Speed',
    definition: 'Average speed of the bat at the point of contact, measured in mph by Statcast tracking. Available from 2024 onward.',
    interpretation: 'League average is ~71 mph; 74+ mph is considered elite. Strongly correlates with raw power output.',
    intuition: 'Faster bat speed gives a hitter more time to read the pitch and still make hard contact — it underlies both power and plate coverage.'
  },
  swingLength: {
    label: 'Swing Length',
    definition: 'Average length of the bat\'s swing path in feet, measured by Statcast tracking. Available from 2024 onward.',
    interpretation: 'Lower is better — league average is ~7.8 ft; elite contact hitters are often under 7.4 ft. Shorter swings reach the zone faster, leaving more time to read the pitch.',
    intuition: 'A compact swing is harder to expand off breaking balls and gives a hitter more pitch-recognition time. It\'s the mechanical complement to bat speed.'
  },
  hardSwingRate: {
    label: 'Hard Swing%',
    definition: 'Percentage of swings classified as maximum-effort "hard" swings by Statcast bat-tracking. Available from 2024 onward.',
    interpretation: 'Higher is better. League average is ~65%. Captures how often a batter commits fully to a swing.',
    intuition: 'Hard swings are a prerequisite for the "blast" metric — you need both hard effort and squared-up contact to produce elite damage.'
  },
  squaredUpPerSwing: {
    label: 'Squared-Up%',
    definition: 'Rate of swings making well-centered sweet-spot contact per swing, per Statcast bat-tracking. Available from 2024 onward.',
    formula: 'Squared-up contacts / total swings.',
    interpretation: 'Higher is better. Separates pure contact ability from swing effort — you can swing hard without squaring it up.',
    intuition: 'Think of it as contact quality divorced from contact rate. A high-Squared-Up% hitter tends to make hard contact even on pitches he isn\'t fully committed to.'
  },
  blastPerSwing: {
    label: 'Blast%',
    definition: 'Rate of swings that are both a hard swing AND squared up, per Statcast bat-tracking. The premier composite bat-tracking quality metric. Available from 2024 onward.',
    formula: 'Blast contacts / total swings.',
    interpretation: 'Higher is better. Combines effort (Hard Swing%) and execution (Squared-Up%) — the gold standard for measuring swing quality.',
    intuition: 'Think of it as the share of swings where a batter brought max effort AND made pure contact. It predicts hard-hit rate and power output better than either component alone.'
  }
}

const STAT_ALIASES = {
  // Standard keys
  'wrc+': 'wrcPlus',
  war: 'war',
  avg: 'avg',
  obp: 'obp',
  slg: 'slg',
  ops: 'ops',
  hr: 'homeRuns',
  rbi: 'rbi',
  sb: 'stolenBases',
  k: 'strikeouts',
  bb: 'walks',
  g: 'gamesPlayed',
  pa: 'plateAppearances',
  ip: 'inningsPitched',
  w: 'wins',
  l: 'losses',
  sv: 'saves',
  woba: 'woba',
  xwoba: 'xwoba',
  xba: 'xba',
  'exitvelo': 'exitVelo',
  maxev: 'maxExitVelo',
  'hardhit%': 'hardHitPct',
  hardhitpct: 'hardHitPct',
  'barrel%': 'barrelPct',
  barrelpct: 'barrelPct',
  launchangle: 'launchAngle',
  'sweetspot%': 'sweetSpotPct',
  sweetspotpct: 'sweetSpotPct',
  sprintspeed: 'sprintSpeed',
  babip: 'babip',
  'k%': 'kPct',
  kpct: 'kPct',
  'bb%': 'bbPct',
  bbpct: 'bbPct',
  'k-bb%': 'kMinusBbPct',
  kminusbbpct: 'kMinusBbPct',
  fip: 'fip',
  xfip: 'xfip',
  era: 'era',
  whip: 'whip',
  'k/9': 'kPer9',
  kper9: 'kPer9',
  'bb/9': 'bbPer9',
  bbper9: 'bbPer9',
  'csw%': 'cswPct',
  cswpct: 'cswPct',
  'gb%': 'gbPct',
  gbpct: 'gbPct',
  velo: 'velocity',
  spin: 'spinRate',
  'h-break': 'horizontalBreak',
  hbreak: 'horizontalBreak',
  'v-break': 'verticalBreak',
  vbreak: 'verticalBreak',
  'whiff%': 'whiffPct',
  whiffpct: 'whiffPct',
  gs: 'gamesStarted',
  'fielding%': 'fieldingPct',
  errors: 'errors',
  putouts: 'putouts',
  assists: 'assists',
  doubleplays: 'doublePlays',
  innings: 'inningsFielding',
  disciplineedge: 'disciplineEdge',
  runpreventionedge: 'runPreventionEdge',
  contactqualityedge: 'contactQualityEdge',
  // Warehouse snake_case column names
  wrc_plus: 'wrcPlus',
  k_pct: 'kPct',
  bb_pct: 'bbPct',
  k_minus_bb_pct: 'kMinusBbPct',
  gb_pct: 'gbPct',
  ld_pct: 'ldPct',
  fb_pct: 'fbPct',
  hr_fb_pct: 'hrFbPct',
  o_swing_pct: 'oSwingPct',
  z_swing_pct: 'zSwingPct',
  bat_speed: 'batSpeed',
  swing_length: 'swingLength',
  hard_swing_rate: 'hardSwingRate',
  squared_up_per_swing: 'squaredUpPerSwing',
  blast_per_swing: 'blastPerSwing',
  k_per_9: 'kPer9',
  bb_per_9: 'bbPer9',
  xfip: 'xfip',
  siera: 'siera',
  iso: 'iso',
  hard_hit_pct: 'hardHitPct',
  barrel_pct: 'barrelPct',
  sweet_spot_pct: 'sweetSpotPct',
  sprint_speed: 'sprintSpeed',
  launch_angle: 'launchAngle',
  exit_velo: 'exitVelo',
  max_exit_velo: 'maxExitVelo',
  avg_exit_velo: 'exitVelo',
  x_woba: 'xwoba',
  x_ba: 'xba',
  games_started: 'gamesStarted',
  innings_pitched: 'inningsPitched',
  plate_appearances: 'plateAppearances',
  stolen_bases: 'stolenBases',
  home_runs: 'homeRuns',
  games_played: 'gamesPlayed',
  tbf: 'plateAppearances'
}

function normalizeStatKey(value) {
  return value == null ? '' : String(value).trim().toLowerCase().replace(/\s+/g, '')
}

export function getStatHelp(statKeyOrLabel) {
  const rawKey = normalizeStatKey(statKeyOrLabel)
  if (!rawKey) return null

  const mappedKey = STAT_ALIASES[rawKey] || rawKey
  return STAT_HELP[mappedKey] || null
}

export { STAT_HELP, STAT_ALIASES }

export function getAllStatHelp() {
  return Object.entries(STAT_HELP).map(([key, help]) => ({ key, ...help }))
}
