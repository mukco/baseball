const STAT_HELP = {
  avg: {
    label: 'AVG',
    definition: 'Batting average is how often a batter records a hit per at-bat.',
    formula: 'Hits / at-bats.',
    formulaLatex: '\\mathrm{AVG}=\\frac{H}{AB}',
    interpretation: 'Higher is better for hitters.'
  },
  obp: {
    label: 'OBP',
    definition: 'On-base percentage measures how often a batter reaches base.',
    formula: '(H + BB + HBP) / (AB + BB + HBP + SF).',
    formulaLatex: '\\mathrm{OBP}=\\frac{H+BB+HBP}{AB+BB+HBP+SF}',
    interpretation: 'Higher is better for hitters.'
  },
  slg: {
    label: 'SLG',
    definition: 'Slugging percentage captures power by weighting extra-base hits.',
    formula: 'Total bases / at-bats.',
    formulaLatex: '\\mathrm{SLG}=\\frac{TB}{AB}',
    interpretation: 'Higher is better for hitters.'
  },
  ops: {
    label: 'OPS',
    definition: 'OPS combines on-base skill and slugging into one quick metric.',
    formula: 'OBP + SLG.',
    formulaLatex: '\\mathrm{OPS}=\\mathrm{OBP}+\\mathrm{SLG}',
    interpretation: 'Higher is better for hitters.'
  },
  homeRuns: {
    label: 'HR',
    definition: 'Home runs hit by a batter or allowed by a pitcher, depending on context.',
    formula: 'Count of home run events.',
    interpretation: 'For hitters higher is better; for pitchers lower allowed is better.'
  },
  rbi: {
    label: 'RBI',
    definition: 'Runs Batted In counts runs scored directly from a batter’s plate appearance.',
    formula: 'Official RBI scoring by MLB rules.',
    interpretation: 'Higher is better, with lineup context effects.'
  },
  stolenBases: {
    label: 'SB',
    definition: 'Stolen bases recorded by a runner.',
    formula: 'Count of successful stolen-base attempts.',
    interpretation: 'Higher is generally better for speed impact.'
  },
  strikeouts: {
    label: 'K',
    definition: 'Strikeouts recorded by a batter (times struck out) or pitcher (batters struck out).',
    formula: 'Count of strikeout events.',
    interpretation: 'For hitters lower is better; for pitchers higher is better.'
  },
  walks: {
    label: 'BB',
    definition: 'Base on balls drawn by hitters or issued by pitchers.',
    formula: 'Count of walk events.',
    interpretation: 'For hitters higher can be good; for pitchers lower is better.'
  },
  gamesPlayed: {
    label: 'G',
    definition: 'Total games appeared in during the selected sample.',
    formula: 'Count of game appearances.',
    interpretation: 'Volume/context stat; not a pure quality metric.'
  },
  plateAppearances: {
    label: 'PA',
    definition: 'Total batting opportunities, including outcomes that are not official at-bats.',
    formula: 'Official PA tally by scorekeeping rules.',
    interpretation: 'Volume stat; useful for sample size and qualification.'
  },
  inningsPitched: {
    label: 'IP',
    definition: 'Innings pitched by a pitcher.',
    formula: 'Outs recorded / 3.',
    formulaLatex: '\\mathrm{IP}=\\frac{\\mathrm{Outs}}{3}',
    interpretation: 'Volume and workload indicator.'
  },
  wins: {
    label: 'W',
    definition: 'Pitcher wins awarded by official scoring rules.',
    formula: 'Count of credited wins.',
    interpretation: 'Context-heavy; team support strongly affects this stat.'
  },
  losses: {
    label: 'L',
    definition: 'Pitcher losses assigned by official scoring rules.',
    formula: 'Count of credited losses.',
    interpretation: 'Lower is generally better, but heavily context-driven.'
  },
  saves: {
    label: 'SV',
    definition: 'Saves credited to relief pitchers who finish games in qualifying situations.',
    formula: 'Official save rule criteria.',
    interpretation: 'Role-dependent counting stat.'
  },
  wrcPlus: {
    label: 'wRC+',
    definition: 'Weighted Runs Created Plus adjusts offensive value for park and league context.',
    formula: 'Scaled to league average = 100.',
    interpretation: 'Higher is better; 120 means 20% better than league average.'
  },
  war: {
    label: 'WAR',
    definition: 'Wins Above Replacement estimates total value versus a readily available replacement player.',
    formula: 'Batting + baserunning + fielding + positional + pitching adjustments.',
    interpretation: 'Higher is better; around 2 is solid, 5+ is All-Star level.'
  },
  woba: {
    label: 'wOBA',
    definition: 'Weighted On-Base Average values each batting event by its run impact.',
    formula: 'Weighted sum of BB/HBP/1B/2B/3B/HR divided by plate appearance-like denominator.',
    formulaLatex: '\\mathrm{wOBA}=\\frac{w_{BB}\\cdot BB+w_{HBP}\\cdot HBP+w_{1B}\\cdot 1B+w_{2B}\\cdot 2B+w_{3B}\\cdot 3B+w_{HR}\\cdot HR}{AB+BB-IBB+SF+HBP}',
    interpretation: 'Higher is better; roughly .320 is average in many seasons.'
  },
  xwoba: {
    label: 'xwOBA',
    definition: 'Expected wOBA estimated from quality of contact and strikeout/walk events.',
    formula: 'Statcast model using exit velocity, launch angle, and event outcomes.',
    interpretation: 'Higher is better; useful for separating skill from short-term luck.'
  },
  xba: {
    label: 'xBA',
    definition: 'Expected batting average from Statcast contact quality.',
    formula: 'Model-based hit probability from batted-ball inputs.',
    interpretation: 'Higher is better; compare to AVG for over/under-performance signals.'
  },
  hardHitPct: {
    label: 'Hard Hit%',
    definition: 'Share of batted balls hit at 95+ mph exit velocity.',
    formula: 'Hard-hit balls / batted balls.',
    formulaLatex: '\\mathrm{HardHit\\%}=\\frac{\\mathrm{HardHitBalls}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for hitters.'
  },
  barrelPct: {
    label: 'Barrel%',
    definition: 'Rate of batted balls in an exit-velocity and launch-angle sweet zone tied to damage.',
    formula: 'Barrels / batted balls.',
    formulaLatex: '\\mathrm{Barrel\\%}=\\frac{\\mathrm{Barrels}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for hitters.'
  },
  launchAngle: {
    label: 'Launch Angle',
    definition: 'Average vertical angle of batted balls off the bat.',
    formula: 'Mean launch angle in degrees.',
    interpretation: 'Context-dependent; extreme low/high angles can limit production.'
  },
  sweetSpotPct: {
    label: 'Sweet Spot%',
    definition: 'Share of batted balls in the optimal launch-angle window.',
    formula: 'Sweet-spot batted balls / batted balls.',
    formulaLatex: '\\mathrm{SweetSpot\\%}=\\frac{\\mathrm{SweetSpotBalls}}{\\mathrm{BattedBalls}}',
    interpretation: 'Higher is generally better for quality contact.'
  },
  sprintSpeed: {
    label: 'Sprint Speed',
    definition: 'Statcast measure of running speed in feet per second on top-effort runs.',
    formula: 'Average of a player’s fastest tracked one-second windows.',
    interpretation: 'Higher is better for speed and baserunning impact.'
  },
  babip: {
    label: 'BABIP',
    definition: 'Batting Average on Balls in Play measures hit rate on non-HR balls put in play.',
    formula: '(H - HR) / (AB - K - HR + SF).',
    formulaLatex: '\\mathrm{BABIP}=\\frac{H-HR}{AB-K-HR+SF}',
    interpretation: 'Context-dependent; extremes often regress toward player/team baseline.'
  },
  kPct: {
    label: 'K%',
    definition: 'Strikeout rate as a share of plate appearances (or batters faced for pitchers).',
    formula: 'Strikeouts / opportunities.',
    formulaLatex: '\\mathrm{K\\%}=\\frac{K}{\\mathrm{Opportunities}}',
    interpretation: 'For hitters lower is better; for pitchers higher is better.'
  },
  bbPct: {
    label: 'BB%',
    definition: 'Walk rate as a share of plate appearances (or batters faced for pitchers).',
    formula: 'Walks / opportunities.',
    formulaLatex: '\\mathrm{BB\\%}=\\frac{BB}{\\mathrm{Opportunities}}',
    interpretation: 'For hitters higher is usually better; for pitchers lower is better.'
  },
  kMinusBbPct: {
    label: 'K-BB%',
    definition: 'Difference between strikeout rate and walk rate.',
    formula: 'K% - BB%.',
    formulaLatex: '\\mathrm{K-BB\\%}=\\mathrm{K\\%}-\\mathrm{BB\\%}',
    interpretation: 'For pitchers higher is better; for hitters lower is often better.'
  },
  fip: {
    label: 'FIP',
    definition: 'Fielding Independent Pitching estimates pitcher run prevention from K, BB, HBP, and HR.',
    formula: '((13*HR + 3*(BB+HBP) - 2*K) / IP) + constant.',
    formulaLatex: '\\mathrm{FIP}=\\frac{13\\cdot HR+3\\cdot(BB+HBP)-2\\cdot K}{IP}+C',
    interpretation: 'Lower is better; strips out most defense-dependent results.'
  },
  xfip: {
    label: 'xFIP',
    definition: 'Expected FIP replaces HR outcomes with expected HR from fly-ball profile.',
    formula: 'FIP-style equation using expected HR component.',
    interpretation: 'Lower is better; smooths noisy year-to-year HR swings.'
  },
  kPer9: {
    label: 'K/9',
    definition: 'Strikeouts recorded per nine innings pitched.',
    formula: '(Strikeouts / innings pitched) * 9.',
    formulaLatex: '\\mathrm{K/9}=\\frac{K}{IP}\\cdot 9',
    interpretation: 'Higher is better for pitchers.'
  },
  bbPer9: {
    label: 'BB/9',
    definition: 'Walks allowed per nine innings pitched.',
    formula: '(Walks / innings pitched) * 9.',
    formulaLatex: '\\mathrm{BB/9}=\\frac{BB}{IP}\\cdot 9',
    interpretation: 'Lower is better for pitchers.'
  },
  cswPct: {
    label: 'CSW%',
    definition: 'Called Strikes plus Whiffs rate, a pitch-level command and bat-miss indicator.',
    formula: '(Called strikes + swinging strikes) / total pitches.',
    formulaLatex: '\\mathrm{CSW\\%}=\\frac{\\mathrm{CalledStrikes}+\\mathrm{Whiffs}}{\\mathrm{TotalPitches}}',
    interpretation: 'Higher is better for pitchers.'
  },
  gbPct: {
    label: 'GB%',
    definition: 'Ground-ball rate, the share of batted balls hit on the ground.',
    formula: 'Ground balls / balls in play.',
    formulaLatex: '\\mathrm{GB\\%}=\\frac{GB}{BIP}',
    interpretation: 'Context-dependent; can support run prevention when paired with command.'
  },
  era: {
    label: 'ERA',
    definition: 'Earned Run Average estimates earned runs allowed per nine innings.',
    formula: '(Earned runs / innings pitched) * 9.',
    formulaLatex: '\\mathrm{ERA}=\\frac{ER}{IP}\\cdot 9',
    interpretation: 'Lower is better for pitchers.'
  },
  whip: {
    label: 'WHIP',
    definition: 'Walks and Hits per Inning Pitched tracks baserunners allowed.',
    formula: '(Walks + hits) / innings pitched.',
    formulaLatex: '\\mathrm{WHIP}=\\frac{BB+H}{IP}',
    interpretation: 'Lower is better for pitchers.'
  },
  exitVelo: {
    label: 'Exit Velo',
    definition: 'Average speed of batted balls off the bat.',
    formula: 'Mean exit velocity in mph.',
    interpretation: 'Higher is generally better for quality of contact.'
  },
  maxExitVelo: {
    label: 'Max EV',
    definition: 'Maximum recorded exit velocity in the selected sample.',
    formula: 'Highest single batted-ball exit velocity.',
    interpretation: 'Higher can indicate top-end contact authority.'
  },
  spinRate: {
    label: 'Spin',
    definition: 'Pitch spin rate in revolutions per minute.',
    formula: 'Average rpm for the pitch type/sample.',
    interpretation: 'Context-dependent; value varies by pitch type and shape.'
  },
  velocity: {
    label: 'Velo',
    definition: 'Pitch velocity, typically measured in miles per hour.',
    formula: 'Average release speed in mph.',
    interpretation: 'Higher can improve stuff, but command and shape still matter.'
  },
  horizontalBreak: {
    label: 'H-Break',
    definition: 'Horizontal movement of a pitch relative to a spinless trajectory.',
    formula: 'Average horizontal break in inches.',
    interpretation: 'Descriptive movement stat; effectiveness depends on shape and mix.'
  },
  verticalBreak: {
    label: 'V-Break',
    definition: 'Vertical movement of a pitch relative to a spinless trajectory.',
    formula: 'Average induced vertical break in inches.',
    interpretation: 'Descriptive movement stat; effectiveness depends on pitch design.'
  },
  whiffPct: {
    label: 'Whiff%',
    definition: 'Rate of swings that miss.',
    formula: 'Swinging strikes / swings.',
    formulaLatex: '\\mathrm{Whiff\\%}=\\frac{\\mathrm{SwingingStrikes}}{\\mathrm{Swings}}',
    interpretation: 'Higher is better for bat-miss ability.'
  },
  gamesStarted: {
    label: 'GS',
    definition: 'Games started by a pitcher.',
    formula: 'Count of starts.',
    interpretation: 'Role/workload indicator rather than pure performance metric.'
  },
  fieldingPct: {
    label: 'Fielding%',
    definition: 'Share of defensive chances converted without an error.',
    formula: '(Putouts + assists) / total chances.',
    formulaLatex: '\\mathrm{Fielding\\%}=\\frac{PO+A}{TC}',
    interpretation: 'Higher is better, though range is not captured directly.'
  },
  errors: {
    label: 'Errors',
    definition: 'Officially scored defensive misplays that let a batter/runner advance.',
    formula: 'Count of charged errors.',
    interpretation: 'Lower is better for defenders.'
  },
  putouts: {
    label: 'Putouts',
    definition: 'Defensive plays where the fielder records an out directly.',
    formula: 'Count of putout events.',
    interpretation: 'Context and position dependent volume stat.'
  },
  assists: {
    label: 'Assists',
    definition: 'Defensive plays where the fielder helps record an out.',
    formula: 'Count of assist events.',
    interpretation: 'Context and position dependent volume stat.'
  },
  doublePlays: {
    label: 'Double Plays',
    definition: 'Plays where two outs are recorded on the same action sequence.',
    formula: 'Count of credited double plays.',
    interpretation: 'Context and opportunity dependent volume stat.'
  },
  inningsFielding: {
    label: 'Innings',
    definition: 'Defensive innings played at fielding positions.',
    formula: 'Outs on defense / 3.',
    formulaLatex: '\\mathrm{Innings}=\\frac{\\mathrm{DefensiveOuts}}{3}',
    interpretation: 'Workload/usage indicator.'
  },
  disciplineEdge: {
    label: 'Discipline Edge',
    definition: 'Difference in strikeout-minus-walk profile between one team and the opponent.',
    formula: 'Opponent K-BB% - Team K-BB%.',
    formulaLatex: '\\mathrm{DisciplineEdge}=\\left(\\mathrm{K\\%-BB\\%}\\right)_{opp}-\\left(\\mathrm{K\\%-BB\\%}\\right)_{team}',
    interpretation: 'Positive value favors the displayed team in plate-discipline profile.'
  },
  runPreventionEdge: {
    label: 'Run Prevention Edge',
    definition: 'Gap in fielding-independent run prevention between teams.',
    formula: 'Opponent FIP - Team FIP.',
    formulaLatex: '\\mathrm{RunPreventionEdge}=\\mathrm{FIP}_{opp}-\\mathrm{FIP}_{team}',
    interpretation: 'Positive value favors the displayed team in expected run prevention.'
  },
  contactQualityEdge: {
    label: 'Contact Quality Edge',
    definition: 'Difference in contact-quality metrics between teams (Statcast-dependent).',
    formula: 'Composite contact quality (team) - composite contact quality (opponent).',
    interpretation: 'Positive value favors the displayed team; may be unavailable when Statcast inputs are missing.'
  }
}

const STAT_ALIASES = {
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
  contactqualityedge: 'contactQualityEdge'
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
