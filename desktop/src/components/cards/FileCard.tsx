import { CardShell } from "./CardShell";
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Folder,
  FileCode,
  FileArchive,
} from "lucide-react";
import type { FileItem } from "@/lib/types";

const EXT_ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText className="w-5 h-5 text-red-400/70" />,
  doc: <FileText className="w-5 h-5 text-blue-400/70" />,
  docx: <FileText className="w-5 h-5 text-blue-400/70" />,
  txt: <FileText className="w-5 h-5 text-slate-400/70" />,
  md: <FileText className="w-5 h-5 text-slate-400/70" />,
  png: <FileImage className="w-5 h-5 text-emerald-400/70" />,
  jpg: <FileImage className="w-5 h-5 text-emerald-400/70" />,
  jpeg: <FileImage className="w-5 h-5 text-emerald-400/70" />,
  gif: <FileImage className="w-5 h-5 text-emerald-400/70" />,
  svg: <FileImage className="w-5 h-5 text-emerald-400/70" />,
  mp4: <FileVideo className="w-5 h-5 text-purple-400/70" />,
  mov: <FileVideo className="w-5 h-5 text-purple-400/70" />,
  mp3: <FileAudio className="w-5 h-5 text-amber-400/70" />,
  wav: <FileAudio className="w-5 h-5 text-amber-400/70" />,
  zip: <FileArchive className="w-5 h-5 text-orange-400/70" />,
  tar: <FileArchive className="w-5 h-5 text-orange-400/70" />,
  js: <FileCode className="w-5 h-5 text-yellow-400/70" />,
  ts: <FileCode className="w-5 h-5 text-blue-400/70" />,
  py: <FileCode className="w-5 h-5 text-green-400/70" />,
  rs: <FileCode className="w-5 h-5 text-orange-400/70" />,
};

function getIcon(ext: string): React.ReactNode {
  return EXT_ICONS[ext.toLowerCase()] || <File className="w-5 h-5 text-slate-400/70" />;
}

function shortenPath(path: string): string {
  const home = path.indexOf("/Users/");
  if (home >= 0) {
    const afterHome = path.slice(home + 7);
    const slash = afterHome.indexOf("/");
    if (slash >= 0) return "~" + afterHome.slice(slash);
  }
  return path;
}

interface Props {
  items: FileItem[];
  onOpenFile?: (path: string) => void;
}

export function FileCard({ items, onOpenFile }: Props) {
  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-2 px-1">
        <Folder className="w-4 h-4 text-indigo-400/70" />
        <span className="text-[13px] font-semibold text-slate-300 uppercase tracking-wider">
          Files
        </span>
        <span className="text-[12px] text-slate-500">{items.length} found</span>
      </div>

      <CardShell className="p-0 overflow-hidden">
        {items.slice(0, 8).map((file, i) => (
          <div
            key={i}
            className={`flex items-center gap-3.5 px-3.5 py-2.5 hover:bg-white/[0.03] cursor-pointer transition-colors ${
              i > 0 ? "border-t border-white/[0.04]" : ""
            }`}
            onClick={() => onOpenFile?.(file.path)}
          >
            {getIcon(file.extension)}
            <div className="flex-1 min-w-0">
              <span className="text-[14px] text-slate-200 block truncate">{file.name}</span>
              <span className="text-[11px] text-slate-500 block truncate">{shortenPath(file.path)}</span>
            </div>
            <span className="text-[11px] text-slate-500 shrink-0">{file.size}</span>
          </div>
        ))}
      </CardShell>
    </div>
  );
}
