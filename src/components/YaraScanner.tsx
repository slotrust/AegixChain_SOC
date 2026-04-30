import React, { useState } from 'react';
import { api } from '../api/client';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function YaraScanner({ targetPath }: { targetPath: string }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleScan = async () => {
    if (!targetPath || targetPath === 'N/A' || targetPath === 'Unknown') {
        toast.error("Invalid path for YARA scan.");
        return;
    }
    setScanning(true);
    try {
      const res = await api.scanTargetFile(targetPath);
      setResult(res.data);
      if (res.data.yaraMatches?.length > 0 || res.data.classification === 'Malicious') {
          toast.error("Suspicions Matches Found with YARA!");
      } else {
          toast.success("YARA Scan completed: Benign");
      }
    } catch(err: any) {
      toast.error(err.response?.data?.error || err.message || "YARA Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mt-4 border border-soc-border/50 rounded-lg p-4 bg-black/20">
       <div className="flex justify-between items-center mb-3">
          <h4 className="text-soc-purple font-mono text-sm tracking-wider uppercase flex items-center gap-2">
             <Search className="w-4 h-4"/> YARA File Structure Scan
          </h4>
          <button 
             onClick={handleScan}
             disabled={scanning}
             className="px-3 py-1 bg-soc-purple/20 text-soc-purple border border-soc-purple/30 rounded font-bold text-xs hover:bg-soc-purple hover:text-black transition-all disabled:opacity-50"
          >
             {scanning ? 'Scanning...' : 'Execute YARA Scan'}
          </button>
       </div>
       {result && (
           <div className={`mt-3 p-3 rounded text-sm font-mono ${result.yaraMatches?.length > 0 || result.classification === 'Malicious' ? 'bg-soc-red/10 border-l-2 border-soc-red text-soc-red' : 'bg-soc-green/10 border-l-2 border-soc-green text-soc-green'}`}>
               <p className="font-bold mb-1">Classification: {result.classification} (Threat Score: {result.threatScore}/100)</p>
               <p className="opacity-80 text-xs mb-2 leading-relaxed">{result.details}</p>
               {result.yaraMatches?.length > 0 && (
                   <div className="mt-2 pt-2 border-t border-current/20">
                      <p className="font-bold uppercase text-[10px] tracking-wider mb-1">Suspicious Indicators (Matched Rules)</p>
                      <ul className="list-disc pl-4 space-y-1 text-xs">
                          {result.yaraMatches.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                   </div>
               )}
           </div>
       )}
    </div>
  )
}
