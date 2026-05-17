require "rails_helper"

RSpec.describe Sandbox::QueryService do
  describe ".validate_sql! (private)" do
    def validate(sql)
      described_class.send(:validate_sql!, sql)
    end

    context "valid queries" do
      it "accepts a bare SELECT" do
        expect { validate("SELECT * FROM batters") }.not_to raise_error
      end

      it "accepts SELECT with conditions" do
        expect { validate("SELECT hr, avg FROM batters WHERE season = 2024") }.not_to raise_error
      end

      it "accepts a WITH...SELECT (CTE)" do
        sql = "WITH t AS (SELECT * FROM batters) SELECT * FROM t"
        expect { validate(sql) }.not_to raise_error
      end

      it "strips a trailing semicolon and succeeds" do
        result = validate("SELECT 1;")
        expect(result).to eq("SELECT 1")
      end

      it "strips inline SQL comments before validation" do
        result = validate("SELECT 1 -- drop table users")
        expect(result).to eq("SELECT 1")
      end

      it "is case-insensitive for SELECT" do
        expect { validate("select * from batters") }.not_to raise_error
      end
    end

    context "write operations are blocked" do
      %w[INSERT UPDATE DELETE DROP ALTER CREATE GRANT REVOKE TRUNCATE ATTACH COPY CALL].each do |kw|
        it "raises for #{kw}" do
          expect { validate("#{kw} INTO foo VALUES (1)") }
            .to raise_error(RuntimeError, /Only read-only SELECT queries are allowed/)
        end
      end

      it "raises when a DML keyword is embedded in an otherwise valid query" do
        expect { validate("SELECT * FROM t WHERE x = 1; DELETE FROM t") }
          .to raise_error(RuntimeError)
      end
    end

    context "structural violations" do
      it "raises for blank SQL" do
        expect { validate("") }.to raise_error(RuntimeError, /SQL query is required/)
      end

      it "raises for a query that does not start with SELECT or WITH" do
        expect { validate("SHOW TABLES") }
          .to raise_error(RuntimeError, /Only read-only SELECT queries are allowed/)
      end

      it "raises for multiple statements separated by semicolons" do
        expect { validate("SELECT 1; SELECT 2") }
          .to raise_error(RuntimeError, /Only one SQL statement is allowed/)
      end
    end

    context "return value" do
      it "returns the cleaned SQL string" do
        result = validate("  SELECT * FROM batters;  ")
        expect(result).to eq("SELECT * FROM batters")
      end
    end
  end

  describe ".run" do
    let(:valid_sql) { "SELECT * FROM batters" }

    context "when the Python process succeeds" do
      let(:payload) do
        { "columns" => ["player", "hr"], "rows" => [["Ohtani", 44]], "row_count" => 1, "truncated" => false }
      end

      before do
        allow(Open3).to receive(:capture3).and_return(
          [payload.to_json, "", instance_double(Process::Status, success?: true)]
        )
        allow(Sandbox::DatasetRegistry).to receive(:tables_for_query).and_return({})
        allow(Sandbox::DatasetRegistry).to receive(:datasets).and_return([])
      end

      it "returns columns, rows, and metadata" do
        result = described_class.run(sql: valid_sql)
        expect(result[:columns]).to eq(["player", "hr"])
        expect(result[:rows]).to eq([["Ohtani", 44]])
        expect(result[:rowCount]).to eq(1)
        expect(result[:truncated]).to be false
        expect(result[:runtimeMs]).to be_a(Integer)
      end
    end

    context "when validation fails" do
      it "raises before spawning a process" do
        expect(Open3).not_to receive(:capture3)
        expect { described_class.run(sql: "DELETE FROM batters") }.to raise_error(RuntimeError)
      end
    end

    context "when the Python process fails" do
      before do
        allow(Open3).to receive(:capture3).and_return(
          ["", "syntax error", instance_double(Process::Status, success?: false)]
        )
        allow(Sandbox::DatasetRegistry).to receive(:tables_for_query).and_return({})
      end

      it "raises with the stderr message" do
        expect { described_class.run(sql: valid_sql) }
          .to raise_error(RuntimeError, /syntax error/)
      end
    end

    context "when the Python process returns an error payload" do
      before do
        allow(Open3).to receive(:capture3).and_return(
          [{ "error" => "table not found" }.to_json, "", instance_double(Process::Status, success?: true)]
        )
        allow(Sandbox::DatasetRegistry).to receive(:tables_for_query).and_return({})
      end

      it "raises with the error message" do
        expect { described_class.run(sql: valid_sql) }
          .to raise_error(RuntimeError, /table not found/)
      end
    end
  end
end
