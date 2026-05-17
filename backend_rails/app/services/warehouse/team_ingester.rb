require "csv"
require "json"
require "fileutils"

module Warehouse
  class TeamIngester
    SEASONS_START = 2010
    FIP_CONSTANT  = 3.2

    TEAM_INFO = {
      108 => { abbr: "LAA", league: "AL", division: "AL West"    },
      109 => { abbr: "ARI", league: "NL", division: "NL West"    },
      110 => { abbr: "BAL", league: "AL", division: "AL East"    },
      111 => { abbr: "BOS", league: "AL", division: "AL East"    },
      112 => { abbr: "CHC", league: "NL", division: "NL Central" },
      113 => { abbr: "CIN", league: "NL", division: "NL Central" },
      114 => { abbr: "CLE", league: "AL", division: "AL Central" },
      115 => { abbr: "COL", league: "NL", division: "NL West"    },
      116 => { abbr: "DET", league: "AL", division: "AL Central" },
      117 => { abbr: "HOU", league: "AL", division: "AL West"    },
      118 => { abbr: "KC",  league: "AL", division: "AL Central" },
      119 => { abbr: "LAD", league: "NL", division: "NL West"    },
      120 => { abbr: "WSH", league: "NL", division: "NL East"    },
      121 => { abbr: "NYM", league: "NL", division: "NL East"    },
      133 => { abbr: "OAK", league: "AL", division: "AL West"    },
      134 => { abbr: "PIT", league: "NL", division: "NL Central" },
      135 => { abbr: "SD",  league: "NL", division: "NL West"    },
      136 => { abbr: "SEA", league: "AL", division: "AL West"    },
      137 => { abbr: "SF",  league: "NL", division: "NL West"    },
      138 => { abbr: "STL", league: "NL", division: "NL Central" },
      139 => { abbr: "TB",  league: "AL", division: "AL East"    },
      140 => { abbr: "TEX", league: "AL", division: "AL West"    },
      141 => { abbr: "TOR", league: "AL", division: "AL East"    },
      142 => { abbr: "MIN", league: "AL", division: "AL Central" },
      143 => { abbr: "PHI", league: "NL", division: "NL East"    },
      144 => { abbr: "ATL", league: "NL", division: "NL East"    },
      145 => { abbr: "CWS", league: "AL", division: "AL Central" },
      146 => { abbr: "MIA", league: "NL", division: "NL East"    },
      147 => { abbr: "NYY", league: "AL", division: "AL East"    },
      158 => { abbr: "MIL", league: "NL", division: "NL Central" }
    }.freeze

    BATTING_COLUMNS = %w[
      team_id name abbr league division season
      g ab h hr r rbi sb bb so
      avg obp slg ops iso babip k_pct bb_pct woba
    ].freeze

    PITCHING_COLUMNS = %w[
      team_id name abbr league division season
      era whip so bb hr h ip sv fip k_per_9 bb_per_9 k_minus_bb_pct
    ].freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)
        seasons = (SEASONS_START..Date.today.year).to_a

        batting_rows  = []
        pitching_rows = []

        seasons.each do |season|
          Rails.logger.info("Warehouse::TeamIngester: fetching #{season}")
          b, p = season_rows(season)
          batting_rows.concat(b)
          pitching_rows.concat(p)
        end

        write_csv(batting_csv_path,  BATTING_COLUMNS,  batting_rows)
        write_csv(pitching_csv_path, PITCHING_COLUMNS, pitching_rows)

        counts = { batting: batting_rows.size, pitching: pitching_rows.size }
        Rails.logger.info("Warehouse::TeamIngester: wrote #{counts[:batting]} batting, #{counts[:pitching]} pitching rows")
        counts
      end

      def batting_csv_path
        base_dir.join("teams_batting.csv")
      end

      def pitching_csv_path
        base_dir.join("teams_pitching.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def season_rows(season)
        hit_splits = fetch_team_stats(season, "hitting")
        pit_splits = fetch_team_stats(season, "pitching")

        pit_by_id = pit_splits.each_with_object({}) do |s, h|
          h[s.dig("team", "id").to_i] = s["stat"] || {}
        end

        batting_rows = hit_splits.filter_map do |split|
          team = split["team"] || {}
          id   = team["id"].to_i
          next unless TEAM_INFO.key?(id)

          h    = split["stat"] || {}
          meta = TEAM_INFO[id]

          ab      = h["atBats"].to_i
          hits    = h["hits"].to_i
          hr      = h["homeRuns"].to_i
          so      = h["strikeOuts"].to_i
          bb      = h["baseOnBalls"].to_i
          ibb     = h["intentionalWalks"].to_i
          hbp     = h["hitByPitch"].to_i
          sf      = h["sacFlies"].to_i
          pa      = h["plateAppearances"].to_i
          doubles = h["doubles"].to_i
          triples = h["triples"].to_i
          singles = [hits - doubles - triples - hr, 0].max
          pa = (ab + bb + hbp + sf) if pa <= 0
          slg = float_or_nil(h["slg"])
          avg = float_or_nil(h["avg"])

          {
            team_id:  id,
            name:     team["name"],
            abbr:     meta[:abbr],
            league:   meta[:league],
            division: meta[:division],
            season:   season,
            g:        h["gamesPlayed"].to_i,
            ab:       ab,
            h:        hits,
            hr:       hr,
            r:        h["runs"].to_i,
            rbi:      h["rbi"].to_i,
            sb:       h["stolenBases"].to_i,
            bb:       bb,
            so:       so,
            avg:      avg,
            obp:      float_or_nil(h["obp"]),
            slg:      slg,
            ops:      float_or_nil(h["ops"]),
            iso:      (slg && avg) ? (slg - avg).round(3) : nil,
            babip:    babip(hits, hr, ab, so, sf),
            k_pct:    ratio(so, pa),
            bb_pct:   ratio(bb, pa),
            woba:     woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf)
          }
        end

        pitching_rows = pit_splits.filter_map do |split|
          team = split["team"] || {}
          id   = team["id"].to_i
          next unless TEAM_INFO.key?(id)

          p    = split["stat"] || {}
          meta = TEAM_INFO[id]

          ip    = innings_to_float(p["inningsPitched"])
          p_hr  = p["homeRuns"].to_i
          p_bb  = p["baseOnBalls"].to_i
          p_hbp = p["hitByPitch"].to_i
          p_so  = p["strikeOuts"].to_i
          p_bf  = p["battersFaced"].to_i

          {
            team_id:          id,
            name:             team["name"],
            abbr:             meta[:abbr],
            league:           meta[:league],
            division:         meta[:division],
            season:           season,
            era:              float_or_nil(p["era"]),
            whip:             float_or_nil(p["whip"]),
            so:               p_so,
            bb:               p_bb,
            hr:               p_hr,
            h:                p["hits"].to_i,
            ip:               ip,
            sv:               p["saves"].to_i,
            fip:              fip_val(p_hr, p_bb, p_hbp, p_so, ip),
            k_per_9:          ip > 0 ? (p_so * 9.0 / ip).round(2) : nil,
            bb_per_9:         ip > 0 ? (p_bb * 9.0 / ip).round(2) : nil,
            k_minus_bb_pct:   ratio(p_so, p_bf) && ratio(p_bb, p_bf) ? (ratio(p_so, p_bf) - ratio(p_bb, p_bf)).round(3) : nil
          }
        end

        [batting_rows, pitching_rows]
      rescue StandardError => e
        Rails.logger.error("Warehouse::TeamIngester season #{season} failed: #{e.message}")
        [[], []]
      end

      def fetch_team_stats(season, group)
        conn = Faraday.new(url: "https://statsapi.mlb.com/api/v1") do |f|
          f.request  :retry, max: 2, interval: 1.0
          f.response :raise_error
          f.options.timeout      = 30
          f.options.open_timeout = 10
        end
        resp = conn.get("teams/stats", { stats: "season", group: group, sportId: 1, season: season })
        JSON.parse(resp.body).dig("stats", 0, "splits") || []
      rescue StandardError => e
        Rails.logger.warn("Warehouse::TeamIngester #{group} fetch failed (#{season}): #{e.message}")
        []
      end

      def write_csv(path, columns, rows)
        CSV.open(path, "wb") do |csv|
          csv << columns
          rows.each { |r| csv << columns.map { |col| r[col.to_sym] } }
        end
      end

      def ratio(num, den)
        return nil if den.to_f <= 0
        (num.to_f / den.to_f).round(3)
      end

      def babip(h, hr, ab, so, sf)
        den = ab.to_i - so.to_i - hr.to_i + sf.to_i
        return nil if den <= 0
        ((h.to_f - hr.to_f) / den).round(3)
      end

      def woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf)
        ubb = bb.to_i - ibb.to_i
        den = ab.to_i + ubb + sf.to_i + hbp.to_i
        return nil if den <= 0
        num = (0.69 * ubb) + (0.72 * hbp.to_i) + (0.88 * singles.to_i) +
              (1.247 * doubles.to_i) + (1.578 * triples.to_i) + (2.031 * hr.to_i)
        (num / den).round(3)
      end

      def fip_val(hr, bb, hbp, so, ip)
        return nil if ip.to_f <= 0
        (((13.0 * hr.to_i) + (3.0 * (bb.to_i + hbp.to_i)) - (2.0 * so.to_i)) / ip.to_f + FIP_CONSTANT).round(3)
      end

      def innings_to_float(ip)
        str = ip.to_s
        return 0.0 if str.empty?
        whole, partial = str.split(".")
        whole.to_i + (partial.to_i / 3.0)
      end

      def float_or_nil(value)
        return nil if value.nil?
        Float(value.to_s)
      rescue ArgumentError, TypeError
        nil
      end
    end
  end
end
