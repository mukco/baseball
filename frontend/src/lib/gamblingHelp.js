const GAMBLING_HELP = {
  moneyline: {
    label: 'Moneyline',
    definition: 'A straight bet on which team will win the game outright, regardless of the score.',
    example: 'Yankees -150 means you risk $150 to win $100. Underdog +130 means you risk $100 to win $130.',
    intuition: 'Think of it as picking the winner — negative odds show the favorite (how much to bet to win $100), positive odds show the underdog (how much you win per $100 bet).'
  },
  runLine: {
    label: 'Run Line',
    definition: 'A spread bet where the favorite gives 1.5 runs (-1.5) and the underdog gets 1.5 runs (+1.5).',
    example: 'Favorite -1.5 (-110) means they must win by 2+. Underdog +1.5 (-110) means they can lose by 1 or win outright.',
    formula: 'Final score adjusted by 1.5 runs before comparing.',
    intuition: 'Think of it as a 1.5-run handicap — the favorite starts at -1.5, the underdog starts at +1.5 before the first pitch.'
  },
  overUnder: {
    label: 'Over / Under (Total)',
    definition: 'A bet on whether the combined final score of both teams will be over or under a set number.',
    example: 'Over 8.5 (-110) wins if the total runs are 9 or more. Under 8.5 (-110) wins if 8 or fewer.',
    intuition: 'Think of it as betting on the game script — over means you expect scoring, under means you expect a pitcher\'s duel.'
  },
  parlay: {
    label: 'Parlay',
    definition: 'A single bet that combines two or more individual bets (legs). All legs must win for the parlay to pay out.',
    formula: 'Odds multiply together, creating a much higher potential payout but lower win probability.',
    example: 'A 3-leg parlay at -110 each pays roughly +596 (risk $100 to win $596).',
    intuition: 'Think of it as stacking bets — each leg compounds the risk and reward. Missing one leg loses the entire bet.'
  },
  teaser: {
    label: 'Teaser',
    definition: 'A parlay where you can adjust the spread or total in your favor for each leg in exchange for lower odds.',
    example: 'A 6-point baseball teaser lets you move the run line from -1.5 to +4.5 for the underdog, but odds are worse than a standard parlay.',
    intuition: 'Think of it as buying insurance — you get better lines but lower payout because the odds are adjusted.'
  },
  props: {
    label: 'Player Props',
    definition: 'Bets on specific player performance outcomes rather than the game result.',
    example: 'Aaron Judge Over 1.5 Total Bases (-120) — wins if Judge gets 2+ total bases (a double counts as 2).',
    intuition: 'Think of it as betting on individual player performance rather than teams.'
  },
  futures: {
    label: 'Futures',
    definition: 'Bets placed on events that will be decided in the future, like season-ending awards or the World Series winner.',
    example: 'Betting the Dodgers at +400 to win the World Series means you win $400 per $100 bet if they do.',
    intuition: 'Think of it as a season-long investment — odds shift throughout the year as new information emerges.'
  },
  americanOdds: {
    label: 'American Odds',
    definition: 'The standard odds format used in the US. Negative odds (-150) show the favorite, positive odds (+200) show the underdog.',
    formula: 'Negative: win $100 per $X risked. Positive: win $X per $100 risked.',
    formulaLatex: '\\text{Win for } +X = \\frac{X}{100} \\times \\text{bet}',
    example: '-150 means risk $150 to win $100. +200 means risk $100 to win $200.',
    intuition: 'Think of odds as "cost to win $100" (negative) or "profit on $100" (positive).'
  },
  impliedProbability: {
    label: 'Implied Probability',
    definition: 'The win probability implied by the odds, accounting for the sportsbook\'s margin (vig).',
    formula: 'For negative odds: |odds| / (|odds| + 100). For positive odds: 100 / (odds + 100).',
    formulaLatex: '\\text{Negative: } \\frac{|odds|}{|odds|+100} \\quad \\text{Positive: } \\frac{100}{odds+100}',
    example: '-150 implies ~60% win probability before vig. +200 implies ~33.3%.',
    intuition: 'Think of it as what the odds say the true probability is — subtract ~4% for the sportsbook cut.'
  },
  vig: {
    label: 'Vig / Juice',
    definition: 'The sportsbook\'s commission built into the odds, ensuring profit regardless of outcome.',
    formula: 'Vig = (1 / implied_prob_favorite) + (1 / implied_prob_underdog) - 1.',
    example: 'Both sides at -110 implies ~52.4% each, totaling ~104.8% — the extra 4.8% is the vig.',
    intuition: 'Think of it as the house edge — the bookmaker charges a fee on every bet, which is why both sides add up to over 100%.'
  },
  push: {
    label: 'Push',
    definition: 'When a bet lands exactly on the number, resulting in no win or loss — your stake is returned.',
    example: 'If you bet Over 8.5 and the final score is exactly 8, most books would refund your bet (push).',
    intuition: 'Think of it as a tie — nobody wins, you get your money back. This is why many totals use .5 to avoid pushes.'
  },
  action: {
    label: 'Action',
    definition: 'A bet that stands regardless of whether a specific player plays. If the player sits, the bet still counts (unless specified "listed pitchers" in baseball).',
    intuition: 'Think of it as "no conditions" — the bet is valid as long as the game is played, whoever is in the lineup.'
  },
  listedPitchers: {
    label: 'Listed Pitchers',
    definition: 'A condition that voids the bet if either listed starting pitcher does not start the game.',
    example: 'You bet the Yankees -150 with listed pitchers. If Cole is scratched, the bet is void and refunded.',
    intuition: 'Think of it as "pitcher protection" — the odds assume these specific pitchers start, and you get a refund if they don\'t.'
  },
  firstFiveInnings: {
    label: 'First 5 Innings (F5)',
    definition: 'A bet that only considers the outcome of the first 5 innings (or 4.5 if the home team leads).',
    example: 'F5 Moneyline: bet on which team leads after 5 innings. F5 Over/Under: total runs through 5 innings.',
    intuition: 'Think of it as betting on the starting pitchers — the bullpens don\'t matter in F5 bets.'
  },
  grandSlam: {
    label: 'Grand Salami',
    definition: 'A bet on the combined total runs scored across all MLB games on a given day.',
    example: 'Over/Under 45.5 total runs across all games on a full 15-game slate.',
    intuition: 'Think of it as a league-wide over/under — one number for the entire day\'s scoring.'
  },
}

const GAMBLING_GROUPS = [
  {
    title: 'Bet Types',
    description: 'Core bet structures and how they work.',
    keys: ['moneyline', 'runLine', 'overUnder', 'parlay', 'teaser', 'props', 'futures'],
  },
  {
    title: 'Odds & Math',
    description: 'How odds work and what they mean.',
    keys: ['americanOdds', 'impliedProbability', 'vig'],
  },
  {
    title: 'Rules & Conditions',
    description: 'Special conditions that affect bets.',
    keys: ['push', 'action', 'listedPitchers', 'firstFiveInnings', 'grandSlam'],
  },
]

export function getGamblingHelp(key) {
  return GAMBLING_HELP[key] || null
}

export function getAllGamblingHelp() {
  return Object.entries(GAMBLING_HELP).map(([key, help]) => ({ key, ...help }))
}

export { GAMBLING_GROUPS }
