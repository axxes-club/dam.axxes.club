"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/lib/types";
import { downloadAsset } from "@/components/folders/utils";

export function DownloadButton({ asset, compact }: { asset: Asset; compact?: boolean }) {
  return (
    <Button
      variant={compact ? "ghost" : "default"}
      size={compact ? "icon-sm" : "default"}
      className="rounded-full"
      onClick={() => downloadAsset(asset)}
      aria-label={`Download ${asset.name}`}
    >
      <Download />
      {!compact && "Download"}
    </Button>
  );
}
