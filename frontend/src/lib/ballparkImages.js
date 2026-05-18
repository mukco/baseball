const BALLPARK_IMAGE_BY_VENUE = {
  'Angel Stadium': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Angelstadiummarch2019.jpg/1280px-Angelstadiummarch2019.jpg',
  'Chase Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Reserve_A-10_Warthogs_Flyover_2023_World_Series_%288099146%29.jpg/1280px-Reserve_A-10_Warthogs_Flyover_2023_World_Series_%288099146%29.jpg',
  'Oriole Park at Camden Yards': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/OrioleParkatCamdenYardsSummer2025.jpg/1280px-OrioleParkatCamdenYardsSummer2025.jpg',
  'Fenway Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg/1280px-131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg',
  'Wrigley Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Wrigley_Field_in_line_with_sign.jpg/1280px-Wrigley_Field_in_line_with_sign.jpg',
  'Great American Ball Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/10Cincinnati_2015_%282%29.jpg/1280px-10Cincinnati_2015_%282%29.jpg',
  'Progressive Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Cleveland_Guardians_vs._New_York_Yankees_on_Oct_17_2024_%2854102149292%29.jpg/1280px-Cleveland_Guardians_vs._New_York_Yankees_on_Oct_17_2024_%2854102149292%29.jpg',
  'Coors Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Coors_Field_Pano.jpg/1920px-Coors_Field_Pano.jpg',
  'Comerica Park': 'https://upload.wikimedia.org/wikipedia/commons/0/06/Detroit_Tigers_opening_game_at_Comerica_Park%2C_2007.jpg',
  'Daikin Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Houston%2C_Texas_%282024%29_-_09.jpg/1280px-Houston%2C_Texas_%282024%29_-_09.jpg',
  'Kauffman Stadium': 'https://upload.wikimedia.org/wikipedia/commons/3/35/Kauffman2017.jpg',
  'UNIQLO Field at Dodger Stadium': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Dodger_Stadium_and_Chavez_Ravine_far_view%2C_Chicago_Cubs_at_Los_Angeles_Dodgers%2C_%28April_12%2C_2025%29.jpg/1280px-Dodger_Stadium_and_Chavez_Ravine_far_view%2C_Chicago_Cubs_at_Los_Angeles_Dodgers%2C_%28April_12%2C_2025%29.jpg',
  'Nationals Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Nationals_Park_8.16.19_-_7.jpg/1280px-Nationals_Park_8.16.19_-_7.jpg',
  'Citi Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Citi_Field_%2848613685207%29.jpg/1280px-Citi_Field_%2848613685207%29.jpg',
  'Sutter Health Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Sutter_Health_Park_aerial_view_2023_%28Quintin_Soloviev%29.jpg/1280px-Sutter_Health_Park_aerial_view_2023_%28Quintin_Soloviev%29.jpg',
  'PNC Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Pittsburgh_Pirates_park_%28Unsplash%29.jpg/1280px-Pittsburgh_Pirates_park_%28Unsplash%29.jpg',
  'Petco Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Petco_Park_Padres_Game.jpg/1280px-Petco_Park_Padres_Game.jpg',
  'T-Mobile Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/SafecoFieldTop.jpg/1280px-SafecoFieldTop.jpg',
  'Oracle Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Oracle_Park_2021.jpg/1280px-Oracle_Park_2021.jpg',
  'Busch Stadium': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Busch_Stadium_2022.jpg/1280px-Busch_Stadium_2022.jpg',
  'Tropicana Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/PXL_20220528_205520913.jpg/1280px-PXL_20220528_205520913.jpg',
  'Globe Life Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/GlobeLifeField2021.jpg/1280px-GlobeLifeField2021.jpg',
  'Rogers Centre': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Rogers_Centre_%28500_Level%29_-_Toronto%2C_ON.jpg/1280px-Rogers_Centre_%28500_Level%29_-_Toronto%2C_ON.jpg',
  'Target Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Target_Field%2C_Minneapolis%2C_Minnesota_%2843167053335%29.jpg/1280px-Target_Field%2C_Minneapolis%2C_Minnesota_%2843167053335%29.jpg',
  'Citizens Bank Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Citizens_Bank_Park_2021.jpg/1280px-Citizens_Bank_Park_2021.jpg',
  'Truist Park': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Truist_Park_2025.jpg/1280px-Truist_Park_2025.jpg',
  'Rate Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Chicago%2C_Illinois%2C_U.S._%282023%29_-_062.jpg/1280px-Chicago%2C_Illinois%2C_U.S._%282023%29_-_062.jpg',
  'loanDepot park': 'https://upload.wikimedia.org/wikipedia/commons/5/53/LOAN_DEPOT_PARK.jpg',
  'Yankee Stadium': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Yankee_Stadium_overhead_2010.jpg/1280px-Yankee_Stadium_overhead_2010.jpg',
  'American Family Field': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Miller_Park_in_Milwaukee%2C_Wisconsin.jpg/1280px-Miller_Park_in_Milwaukee%2C_Wisconsin.jpg',
}

export function ballparkImageForVenue(venue) {
  return BALLPARK_IMAGE_BY_VENUE[String(venue || '').trim()] || null
}

// Maps MLB team_id → home venue name so sim game cards can show ballpark backgrounds.
const VENUE_BY_TEAM_ID = {
  108: 'Angel Stadium',
  109: 'Chase Field',
  110: 'Oriole Park at Camden Yards',
  111: 'Fenway Park',
  112: 'Wrigley Field',
  113: 'Great American Ball Park',
  114: 'Progressive Field',
  115: 'Coors Field',
  116: 'Comerica Park',
  117: 'Daikin Park',
  118: 'Kauffman Stadium',
  119: 'UNIQLO Field at Dodger Stadium',
  120: 'Nationals Park',
  121: 'Citi Field',
  133: 'Sutter Health Park',
  134: 'PNC Park',
  135: 'Petco Park',
  136: 'T-Mobile Park',
  137: 'Oracle Park',
  138: 'Busch Stadium',
  139: 'Tropicana Field',
  140: 'Globe Life Field',
  141: 'Rogers Centre',
  142: 'Target Field',
  143: 'Citizens Bank Park',
  144: 'Truist Park',
  145: 'Rate Field',
  146: 'loanDepot park',
  147: 'Yankee Stadium',
  158: 'American Family Field',
}

export function ballparkImageForTeam(teamId) {
  const venue = VENUE_BY_TEAM_ID[Number(teamId)]
  return venue ? ballparkImageForVenue(venue) : null
}
