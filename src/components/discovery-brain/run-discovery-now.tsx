"use client";

import { useState, useTransition } from "react";
import { runDiscoveryNowAction } from "@/lib/actions/discovery-brain";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/loading";

const SEARCH_TYPE_OPTIONS = [
  { value: "", label: "All search types" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "PROJECT", label: "Project" },
  { value: "TENDER", label: "Tender" },
  { value: "VENDOR_REGISTRATION", label: "Vendor registration" },
];

/** Max batch size a manual run can request — a plan/environment placeholder, not yet tied to a real per-plan limit. */
const MAX_BATCH_SIZE = 50;

export function RunDiscoveryNow() {
  const [searchType, setSearchType] = useState("");
  const [country, setCountry] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run() {
    startTransition(async () => {
      setMessage(null);
      const maxQueueItems = batchSize ? Math.min(Number(batchSize), MAX_BATCH_SIZE) : undefined;
      const response = await runDiscoveryNowAction({
        searchType: (searchType || undefined) as never,
        country: country.trim() || undefined,
        maxQueueItems,
      });
      if (!response.ok) {
        setIsError(true);
        setMessage(response.error);
        return;
      }
      setIsError(false);
      setMessage(
        `Run ${response.status.toLowerCase()}: executed ${response.queriesExecuted} ${
          response.queriesExecuted === 1 ? "query" : "queries"
        }, found ${response.rawResultsFound} raw results (${response.duplicatesFound} duplicates), ${response.errorsCount} error${
          response.errorsCount === 1 ? "" : "s"
        }.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="run-search-type">Search type</Label>
          <Select
            id="run-search-type"
            className="mt-1"
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
          >
            {SEARCH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="run-country">Country (ISO code, optional)</Label>
          <Input
            id="run-country"
            className="mt-1"
            placeholder="e.g. US"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
          />
        </div>
        <div>
          <Label htmlFor="run-batch-size">Batch size (optional, max {MAX_BATCH_SIZE})</Label>
          <Input
            id="run-batch-size"
            className="mt-1"
            type="number"
            min={1}
            max={MAX_BATCH_SIZE}
            placeholder="Environment default"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={isPending} onClick={run}>
          {isPending && <Spinner />}
          {isPending ? "Running discovery..." : "Run Discovery Now"}
        </Button>
        {message && (
          <p className={`text-sm ${isError ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
