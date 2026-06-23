import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { 
  Upload, 
  Trash2, 
  Play, 
  Copy, 
  Check, 
  AlertTriangle, 
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  BookmarkCheck,
  Compass,
  FolderOpen,
  FolderClosed,
  Plus,
  Edit2,
  Save,
  Menu,
  PanelLeftClose,
  PanelLeft,
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UploadedImage, ProcessingBatch, Settings, MangaProject } from './types';
import { fileToBase64, analyzeMangaBatch } from './utils/api';
import { saveProjectToDB, loadAllProjectsFromDB, deleteProjectFromDB } from './utils/db';

const DEFAULT_SETTINGS: Settings = {
  apiKey: "8d9614815be4c2cede1cd5f951c5f83e",
  baseUrl: "https://api.kie.ai/gemini-3-flash/v1",
  model: "gemini-3-flash"
};

export default function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('manga_recap_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return DEFAULT_SETTINGS;
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentBatchInfo, setCurrentBatchInfo] = useState<string>('');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [initialContext, setInitialContext] = useState<string>('');
  
  // Projects dashboard states
  const [projects, setProjects] = useState<MangaProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [showProjectsSidebar, setShowProjectsSidebar] = useState<boolean>(true);

  // Dialog state replacements for iframe safety (no window.prompt/confirm/alert)
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [projectToDelete, setProjectToDelete] = useState<MangaProject | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Highlighting and scrolling alignment states
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState<boolean>(false);

  // References for scrolling panels
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Load all projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const savedProjects = await loadAllProjectsFromDB();
        setProjects(savedProjects);
        
        const lastActiveId = localStorage.getItem('manga_recap_active_project_id');
        const hasLastActive = lastActiveId && savedProjects.some(p => p.id === lastActiveId);
        
        if (hasLastActive) {
          setActiveProjectId(lastActiveId);
          const activeProj = savedProjects.find(p => p.id === lastActiveId)!;
          setImages(activeProj.images || []);
          setInitialContext(activeProj.initialContext || '');
        } else if (savedProjects.length > 0) {
          const firstProj = savedProjects[0];
          setActiveProjectId(firstProj.id);
          setImages(firstProj.images || []);
          setInitialContext(firstProj.initialContext || '');
          localStorage.setItem('manga_recap_active_project_id', firstProj.id);
        } else {
          // No projects found, create initial default project
          const defaultId = 'proj_' + Math.random().toString(36).substring(7);
          const defaultProj: MangaProject = {
            id: defaultId,
            name: "Projek Rangkuman #1",
            createdAt: new Date().toISOString(),
            initialContext: "",
            images: []
          };
          await saveProjectToDB(defaultProj);
          setProjects([defaultProj]);
          setActiveProjectId(defaultId);
          setImages([]);
          setInitialContext("");
          localStorage.setItem('manga_recap_active_project_id', defaultId);
        }
      } catch (err) {
        console.error("Gagal memulai database projek:", err);
      }
    }
    loadProjects();
  }, []);

  // Sync state changes back to active project in state and IndexedDB
  useEffect(() => {
    if (!activeProjectId) return;
    
    const currentProj = projects.find(p => p.id === activeProjectId);
    if (!currentProj) return;
    
    // Quick deep-comparison check to avoid infinite saving loop
    const isImagesDiff = JSON.stringify(currentProj.images) !== JSON.stringify(images);
    const isContextDiff = currentProj.initialContext !== initialContext;
    
    if (isImagesDiff || isContextDiff) {
      const updatedProj: MangaProject = {
        ...currentProj,
        images,
        initialContext
      };
      
      setProjects(prev => prev.map(p => p.id === activeProjectId ? updatedProj : p));
      saveProjectToDB(updatedProj);
    }
  }, [images, initialContext, activeProjectId]);

  // Project management functions
  const selectProject = (id: string) => {
    if (isProcessing) return;
    const targetProj = projects.find(p => p.id === id);
    if (targetProj) {
      setActiveProjectId(id);
      setImages(targetProj.images || []);
      setInitialContext(targetProj.initialContext || '');
      localStorage.setItem('manga_recap_active_project_id', id);
      
      setActiveIndex(null);
      setHighlightedIndex(null);
      setGlobalError(null);
    }
  };

  const createNewProject = async (name?: string) => {
    if (isProcessing) return;
    const count = projects.length;
    const autoName = name && name.trim().length > 0 ? name : `Projek Rangkuman #${count + 1}`;
    const newId = 'proj_' + Math.random().toString(36).substring(7);
    
    const newProj: MangaProject = {
      id: newId,
      name: autoName,
      createdAt: new Date().toISOString(),
      initialContext: "",
      images: []
    };
    
    await saveProjectToDB(newProj);
    setProjects(prev => [newProj, ...prev]);
    
    setActiveProjectId(newId);
    setImages([]);
    setInitialContext("");
    localStorage.setItem('manga_recap_active_project_id', newId);
    
    setActiveIndex(null);
    setHighlightedIndex(null);
    setGlobalError(null);
  };

  const startRenameProject = (id: string, name: string) => {
    setEditingProjectId(id);
    setEditingName(name);
  };

  const saveRenameProject = async (id: string) => {
    if (!editingName.trim()) return;
    const targetProj = projects.find(p => p.id === id);
    if (targetProj) {
      const updatedProj = { ...targetProj, name: editingName.trim() };
      setProjects(prev => prev.map(p => p.id === id ? updatedProj : p));
      await saveProjectToDB(updatedProj);
    }
    setEditingProjectId(null);
    setEditingName('');
  };

  const triggerDeleteProject = (project: MangaProject) => {
    if (isProcessing) return;
    if (projects.length <= 1) {
      setAlertMessage("Anda harus menyisakan minimal satu projek aktif.");
      return;
    }
    setProjectToDelete(project);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const { id } = projectToDelete;

    await deleteProjectFromDB(id);
    const nextProjects = projects.filter(p => p.id !== id);
    setProjects(nextProjects);
    
    if (activeProjectId === id) {
      const fallbackProj = nextProjects[0];
      setActiveProjectId(fallbackProj.id);
      setImages(fallbackProj.images || []);
      setInitialContext(fallbackProj.initialContext || '');
      localStorage.setItem('manga_recap_active_project_id', fallbackProj.id);
    }

    setProjectToDelete(null);
  };

  // Save settings automatically on edit
  useEffect(() => {
    localStorage.setItem('manga_recap_settings', JSON.stringify(settings));
  }, [settings]);

  // Handle files selection & sorting
  const handleFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
    await processAndAddFiles(files);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing || !e.target.files) return;
    const files = (Array.from(e.target.files) as File[]).filter(f => f.type.startsWith('image/'));
    await processAndAddFiles(files);
  };

  const processAndAddFiles = async (files: File[]) => {
    setGlobalError(null);
    try {
      const processed: UploadedImage[] = await Promise.all(
        files.map(async (file) => {
          const base64Data = await fileToBase64(file);
          return {
            id: Math.random().toString(36).substring(7),
            name: file.name,
            previewUrl: base64Data,
            base64: base64Data.split(',')[1] || '',
            mimeType: file.type,
            status: 'pending' as const
          };
        })
      );

      // Natural alphabetic sort by filename so that image_001, image_002, image_10 align in order natively
      const combined = [...images, ...processed];
      combined.sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      setImages(combined);
    } catch (err: any) {
      setGlobalError(`Gagal membaca file gambar: ${err.message || err}`);
    }
  };

  const removeImage = (id: string) => {
    if (isProcessing) return;
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearAllImages = () => {
    if (isProcessing) return;
    setImages([]);
    setActiveIndex(null);
    setGlobalError(null);
  };

  // Perform core batch processing logic (batches of 6)
  const startRecapGeneration = async () => {
    if (isProcessing || images.length === 0) return;
    setIsProcessing(true);
    setGlobalError(null);

    // Filter images that require processing (pending or failed)
    const pendingImages = images.map((img, idx) => ({ img, idx }))
      .filter(({ img }) => img.status === 'pending' || img.status === 'failed');

    if (pendingImages.length === 0) {
      // If all are already processed, let's reset and allow complete regeneration
      const resetImages = images.map(img => ({
        ...img,
        status: 'pending' as const,
        naskah: undefined,
        error: undefined
      }));
      setImages(resetImages);
      // Wait a moment before running with newly reset list
      setTimeout(() => processQueue(resetImages), 100);
    } else {
      await processQueue(images);
    }
  };

  const resumeRecapGeneration = async () => {
    if (isProcessing || images.length === 0) return;
    setIsProcessing(true);
    setGlobalError(null);
    await processQueue(images);
  };

  const restartRecapGeneration = async () => {
    if (isProcessing || images.length === 0) return;
    setIsProcessing(true);
    setGlobalError(null);

    const resetImages = images.map(img => ({
      ...img,
      status: 'pending' as const,
      naskah: undefined,
      error: undefined
    }));
    setImages(resetImages);
    setTimeout(() => processQueue(resetImages), 100);
  };

  const retryFromFailedCard = async (id: string) => {
    if (isProcessing) return;
    setGlobalError(null);

    const updatedImages = images.map(img => 
      img.id === id ? { ...img, status: 'pending' as const, error: undefined } : img
    );
    setImages(updatedImages);
    
    setIsProcessing(true);
    setTimeout(() => {
      processQueue(updatedImages);
    }, 100);
  };

  const saveScriptToProject = async (filename: string, content: string) => {
    try {
      const res = await fetch("/api/save-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ filename, content })
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Successfully auto-saved script:", data.path);
      }
    } catch (err) {
      console.error("Gagal auto-save naskah ke folder projek:", err);
    }
  };

  const processQueue = async (currentImagesList: UploadedImage[]) => {
    let imagesState = [...currentImagesList];
    const imageSize = imagesState.length;
    const batchSize = 6;

    try {
      // Find indexes still pending / failed
      const pendingIndices = imagesState
        .map((img, i) => (img.status === 'pending' || img.status === 'failed' ? i : -1))
        .filter(idx => idx !== -1);

      // Group these indices into blocks of 6
      const batches: number[][] = [];
      for (let i = 0; i < pendingIndices.length; i += batchSize) {
        batches.push(pendingIndices.slice(i, i + batchSize));
      }

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batchImgIndices = batches[batchIdx];
        
        // Update statuses to 'processing'
        imagesState = imagesState.map((img, i) => {
          if (batchImgIndices.includes(i)) {
            return { ...img, status: 'processing' as const };
          }
          return img;
        });
        setImages([...imagesState]);
        
        const friendlyRange = `${batchImgIndices[0] + 1} - ${batchImgIndices[batchImgIndices.length - 1] + 1}`;
        setCurrentBatchInfo(`Memproses Batch ${batchIdx + 1} dari ${batches.length} (Halaman ${friendlyRange})`);

        // Get images for the current batch
        const batchImages = batchImgIndices.map(i => imagesState[i]);

        // Get up to 1500 characters of previous naskah context to keep story continuity
        const precedingNaskahs = imagesState
          .slice(0, batchImgIndices[0])
          .map(img => img.naskah)
          .filter(Boolean)
          .join('\n\n');
        
        let previousContext = '';
        if (batchImgIndices[0] === 0) {
          previousContext = initialContext || '';
        } else {
          previousContext = precedingNaskahs.length > 1500
            ? precedingNaskahs.substring(precedingNaskahs.length - 1500)
            : precedingNaskahs;
        }

        const maxAttempts = 4; // 1 percoban awal + 3 kali retry
        let lastErrorMsg = '';

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            // Jika ini adalah percobaan ulang (retry), beri jeda waktu dan update info UI
            if (attempt > 1) {
              const retryInfo = `Mencoba kembali secara otomatis (Percobaan ulang ${attempt - 1}/3) untuk Halaman ${friendlyRange}...`;
              setCurrentBatchInfo(retryInfo);
              // Tunggu 3 detik sebelum lanjut mencoba lagi demi menghindari rate-limiting atau overload sementara
              await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // Call the Kie AI client-side endpoint with story context and specify if it is the first batch
            const results = await analyzeMangaBatch(
              batchImages, 
              settings, 
              previousContext, 
              batchImgIndices[0] === 0
            );

            // Map results back to images
            imagesState = imagesState.map((img, i) => {
              if (batchImgIndices.includes(i)) {
                // Try to find matching result by exact filename
                let result = results.find(r => r.filename?.toLowerCase().trim() === img.name.toLowerCase().trim());
                
                // Fallback: If no filename matched, map in physical relative sequence of the batch
                if (!result) {
                  const batchRelativeIndex = batchImgIndices.indexOf(i);
                  if (results[batchRelativeIndex]) {
                    result = results[batchRelativeIndex];
                  }
                }

                if (result) {
                  // Auto save to project folder!
                  saveScriptToProject(img.name, result.naskah);
                  return {
                    ...img,
                    status: 'success' as const,
                    naskah: result.naskah,
                    error: undefined
                  };
                } else {
                  return {
                    ...img,
                    status: 'failed' as const,
                    error: 'AI tidak mengembalikan naskah untuk gambar ini.'
                  };
                }
              }
              return img;
            });

            setImages([...imagesState]);
            break; // Jika sukses, keluar dari loop retry dan lanjut ke batch berikutnya
          } catch (batchErr: any) {
            console.error(`Batch error on attempt ${attempt}:`, batchErr);
            lastErrorMsg = batchErr.message || "Gagal memproses gambar";

            if (attempt < maxAttempts) {
              // Masih ada sisa kesempatan retry, ulangi loop
              continue;
            }

            // Semua percobaan retry habis. Tandai gambar di batch ini sebagai gagal
            imagesState = imagesState.map((img, i) => {
              if (batchImgIndices.includes(i)) {
                return {
                  ...img,
                  status: 'failed' as const,
                  error: `${lastErrorMsg} (Gagal setelah 3 kali mencoba ulang secara otomatis)`
                };
              }
              return img;
            });
            setImages([...imagesState]);
            
            throw new Error(`Gagal pada Halaman ${friendlyRange} setelah mencoba ulang sebanyak 3 kali: ${lastErrorMsg}`);
          }
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Terjadi kesalahan tidak terduga saat memisahkan batch.');
    } finally {
      setIsProcessing(false);
      setCurrentBatchInfo('');
    }
  };

  // Auto-scroll and align elements
  const scrollToLabel = (index: number) => {
    setActiveIndex(index);
    setHighlightedIndex(index);

    // Clean highlight after brief pulse
    setTimeout(() => {
      setHighlightedIndex(null);
    }, 1500);

    const leftCard = document.getElementById(`image-card-${index}`);
    const rightCard = document.getElementById(`naskah-card-${index}`);

    if (leftCard && leftPanelRef.current) {
      leftCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (rightCard && rightPanelRef.current) {
      rightCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllScripts = () => {
    // Collect all scripts in order, separated nicely without headers/separators
    const allText = images
      .filter(img => img.status === 'success' && img.naskah)
      .map(img => img.naskah)
      .join('\n\n');

    if (!allText) return;
    navigator.clipboard.writeText(allText);
    setCopyAllSuccess(true);
    setTimeout(() => setCopyAllSuccess(false), 2500);
  };

  const hasSucceeded = images.some(img => img.status === 'success');
  const hasFailed = images.some(img => img.status === 'failed');
  const hasPending = images.some(img => img.status === 'pending');

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* Main Workspace Frame */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Toggle Button for Projects Sidebar when collapsed */}
        {!showProjectsSidebar && (
          <button
            onClick={() => setShowProjectsSidebar(true)}
            className="absolute top-4 left-4 z-40 p-2 bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-xl flex items-center justify-center"
            title="Tampilkan daftar projek"
          >
            <PanelLeft className="w-4 h-4 text-sky-400" />
          </button>
        )}

        {/* Projects Sidebar (Collapsible) */}
        <div className={`border-r border-slate-800/80 bg-slate-950/50 backdrop-blur-md transition-all duration-300 flex flex-col shrink-0 ${showProjectsSidebar ? 'w-64' : 'w-0 overflow-hidden border-r-0'}`}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-800/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-sky-400 animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-wider text-slate-100 uppercase">PROJEK RECAP</span>
            </div>
            <button
              onClick={() => setShowProjectsSidebar(false)}
              className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Sembunyikan Sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          
          {/* New Project Button */}
          <div className="p-3">
            <button
              onClick={() => {
                setNewProjectName(`Projek Rangkuman #${projects.length + 1}`);
                setShowCreateModal(true);
              }}
              className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-xs font-semibold rounded text-white transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Projek Baru
            </button>
          </div>
          
          {/* Projects List Container */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
            <div className="px-2 pb-1 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Daftar Projek Anda
            </div>
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              const isEditing = p.id === editingProjectId;
              const imageCount = p.images?.length || 0;
              const completedCount = p.images?.filter(img => img.status === 'success').length || 0;
              
              return (
                <div 
                  key={p.id}
                  onClick={() => !isEditing && selectProject(p.id)}
                  className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1 ${
                    isActive 
                      ? 'bg-slate-900 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/15' 
                      : 'bg-transparent border-transparent hover:bg-slate-900/40 hover:border-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => saveRenameProject(p.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveRenameProject(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="flex-1 text-xs px-1.5 py-0.5 bg-slate-850 border border-indigo-500 text-slate-100 rounded focus:outline-none"
                      />
                    ) : (
                      <span className={`text-xs font-medium truncate ${isActive ? 'text-indigo-300' : 'text-slate-300 group-hover:text-slate-100'}`}>
                        {p.name}
                      </span>
                    )}

                    {!isEditing && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenameProject(p.id, p.name);
                          }}
                          title="Ubah Nama"
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDeleteProject(p);
                          }}
                          title="Hapus Projek"
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Metadata line */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>
                      {imageCount} halaman
                    </span>
                    {completedCount > 0 && (
                      <span className="text-emerald-400">
                        {completedCount}/{imageCount} selesai
                      </span>
                    )}
                  </div>
                  
                  {/* Date line */}
                  <div className="text-[9px] text-slate-600 font-mono">
                    {new Date(p.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Sidebar Footer */}
        </div>

         {images.length === 0 ? (
          /* Landing Empty Workspace - Upload State */
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/50 text-slate-400 overflow-y-auto"
          >
            <div className={`max-w-xl w-full p-8 border border-slate-800/80 rounded-2xl bg-slate-950/55 text-center flex flex-col items-center gap-6 shadow-2xl relative ${!showProjectsSidebar ? 'mt-8' : ''}`}>
              {/* Optional header indicating active project name */}
              {activeProject && (
                <div className="absolute top-4 right-4 bg-slate-900/85 border border-slate-800 text-[10px] font-mono font-medium text-indigo-400 px-2.5 py-1 rounded">
                  Projek Aktif: {activeProject.name}
                </div>
              )}
              <div className="p-4 bg-slate-900 rounded-full text-indigo-400 font-bold flex items-center gap-2">
                <Compass className="w-6 h-6 text-sky-400 animate-pulse" />
                <span className="font-mono text-sm tracking-widest text-slate-200">MANGA RECAP AI</span>
              </div>
              <div className="w-full">
                <h3 className="text-sm font-semibold text-slate-200">Upload Halaman Manga</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  Tarik & lepas kumpulan gambar manga Anda di sini atau pilih file secara manual. Sistem akan otomatis mengurutkan berdasarkan nama berkas untuk menjaga jalan cerita.
                </p>
              </div>

              <label className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow-lg transition-all cursor-pointer">
                Pilih Gambar
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {/* Konteks Cerita Sebelumnya (Opsional) */}
              <div className="w-full text-left mt-4 border-t border-slate-800/85 pt-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-mono font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Konteks Part / Episode Sebelumnya (Opsional)
                  </label>
                  {initialContext && (
                    <button
                      onClick={() => setInitialContext('')}
                      className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mb-2.5 leading-relaxed">
                  Masukkan naskah 2-3 paragraf dari part sebelumnya, rangkuman cerita lalu, spoiler, atau info kelanjutan agar narasi untuk batch pertama langsung menyambung dari titik tersebut.
                </p>
                <textarea
                  value={initialContext}
                  onChange={(e) => setInitialContext(e.target.value)}
                  placeholder="Contoh: Di episode sebelumnya, MC berhasil mengalahkan bos pertahanan dungeon lantai 10 dan menemukan pedang terkutuk..."
                  rows={4}
                  className="w-full text-xs px-3 py-2.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none transition-all font-sans resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Actual 3-Column Native Workspace */
          <div className="flex-1 flex h-full overflow-hidden">
            
            {/* Left Column: Sorted Manga Pages Display */}
            <div 
              ref={leftPanelRef}
              className="w-[45%] h-full overflow-y-auto px-6 py-6 border-r border-slate-800 bg-slate-950/20 backdrop-blur-sm"
            >
              {/* Local Left Header without dark solid blocks acting like "bridges" */}
              <div className="flex flex-col gap-3 pb-4 mb-5 border-b border-slate-800/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">Halaman Manga ({images.length})</h2>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearAllImages}
                      disabled={isProcessing}
                      className="text-[11px] font-mono hover:text-rose-450 text-slate-400 hover:text-rose-450 transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      title="Bersihkan Semua Gambar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Bersihkan
                    </button>
                  </div>
                </div>

                  {/* Local Action Button & Progress */}
                <div className="flex flex-col gap-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-slate-300">
                        {isProcessing 
                          ? "Proses generate naskah berjalan..." 
                          : hasSucceeded && (hasFailed || hasPending)
                            ? `Progress Terjeda (${images.filter(x => x.status === 'success').length}/${images.length} Terbuat)`
                            : "Siap melakukan recap cerita"
                        }
                      </span>
                      {hasSucceeded && (hasFailed || hasPending) && !isProcessing && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Lanjutkan untuk memproses halaman sisa tanpa mengulang halaman sukses
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isProcessing ? (
                        <button
                          disabled
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-slate-800/80 text-slate-400 border border-slate-700/80 cursor-not-allowed select-none shadow"
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Memproses...
                        </button>
                      ) : hasSucceeded && (hasFailed || hasPending) ? (
                        <>
                          <button
                            onClick={restartRecapGeneration}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border border-slate-800 hover:border-slate-700 hover:bg-slate-905 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                            title="Ulangi pembuatan naskah dari halaman pertama"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Mulai Baru
                          </button>
                          
                          <button
                            onClick={resumeRecapGeneration}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white transition-all shadow-md cursor-pointer animate-pulse-subtle"
                            title="Lanjutkan halaman yang tertunda atau gagal"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Lanjutkan (Resume)
                          </button>
                        </>
                      ) : hasSucceeded ? (
                        <button
                          onClick={restartRecapGeneration}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white transition-all cursor-pointer shadow"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Regenerate Semua
                        </button>
                      ) : (
                        <button
                          onClick={startRecapGeneration}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white transition-all cursor-pointer shadow"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          Mulai Generate
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Context Badge Confirmation */}
                  <div className="flex items-center gap-2 border-t border-slate-900/60 pt-2 text-[10px] text-slate-400 font-mono">
                    <span className="text-slate-500">Awal Batch #1:</span>
                    {initialContext ? (
                      <span className="font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-2 py-0.5 rounded flex items-center gap-1">
                        <BookmarkCheck className="w-3 h-3" />
                        Cerita Lanjutan (Menggunakan Konteks)
                      </span>
                    ) : (
                      <span className="font-semibold text-sky-400 bg-sky-950/40 border border-sky-900/40 px-2 py-0.5 rounded flex items-center gap-1">
                        <Play className="w-2 h-2 text-sky-400 fill-current" />
                        Cerita Dimulai (Tanpa Konteks)
                      </span>
                    )}
                  </div>

                  {currentBatchInfo && (
                    <div className="text-[10px] bg-slate-900 border border-slate-800 text-indigo-400 rounded-md p-2 font-mono select-none">
                      {currentBatchInfo}
                    </div>
                  )}

                  {globalError && (
                    <div className="text-[10px] bg-rose-950/30 border border-rose-900/60 text-rose-300 rounded-md p-2 select-none">
                      {globalError}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {images.map((img, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  const isProcessingItem = img.status === 'processing';
                  const isSuccess = img.status === 'success';
                  const isFailed = img.status === 'failed';

                  return (
                    <div
                      key={img.id}
                      id={`image-card-${idx}`}
                      className={`relative rounded-xl border p-4 transition-all duration-300 ${
                        isHighlighted 
                          ? 'border-indigo-500 bg-indigo-950/30' 
                          : 'border-slate-800/80 bg-slate-950/60'
                      }`}
                    >
                      {/* Meta badge */}
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                            #{idx + 1}
                          </span>
                          <span className="text-[11px] font-mono text-slate-300 truncate max-w-[200px]" title={img.name}>
                            {img.name}
                          </span>
                        </div>

                        {/* Status Label */}
                        <div className="flex items-center gap-1.5">
                          {isProcessingItem && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                              Analyzing
                            </span>
                          )}
                          {isSuccess && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                              Success
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-rose-400 tracking-wider">
                              Failed
                            </span>
                          )}
                          {!isProcessingItem && !isSuccess && !isFailed && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                              Pending
                            </span>
                          )}

                          {!isProcessing && (
                            <button
                              onClick={() => removeImage(img.id)}
                              className="ml-2 hover:text-rose-400 text-slate-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Image Viewer: Dynamic & Uncropped with natural aspect ratio */}
                      <div className="relative w-full bg-slate-950/40 border border-slate-800/80 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
                        <img
                          src={img.previewUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-auto block select-none object-contain"
                        />
                        
                        {/* Overlay and animations */}
                        <AnimatePresence>
                          {isProcessingItem && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 bg-slate-950/70 border border-indigo-500/50 flex flex-col items-center justify-center gap-3"
                            >
                              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                              <div className="text-[10px] tracking-widest text-indigo-300 font-mono uppercase bg-slate-900 px-3 py-1 rounded">
                                MEMBACA PANEL (KANAN KE KIRI)
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Error state details */}
                      {img.error && (
                        <div className="mt-2.5 p-2.5 bg-rose-950/40 border border-rose-900/65 rounded-lg flex flex-col gap-2">
                          <span className="text-[11px] text-rose-300 leading-relaxed">
                            {img.error}
                          </span>
                          {!isProcessing && (
                            <button
                              onClick={() => retryFromFailedCard(img.id)}
                              className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/50 hover:border-rose-600 rounded text-rose-100 transition-all cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Coba Lagi Halaman Ini (Retry)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Middle Column: Vertical Nav Label Rail */}
            <div className="w-[10%] shrink-0 h-full flex flex-col items-center justify-start border-r border-slate-800 bg-slate-950/60 py-6 overflow-y-auto">
              <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase font-mono mb-4 text-center">
                LABEL
              </div>
              <div className="flex flex-col gap-2 items-center w-full px-2 animate-fade-in">
                {images.map((img, idx) => {
                  const isActive = activeIndex === idx;
                  let dotColor = "bg-slate-700";
                  if (img.status === 'processing') dotColor = "bg-sky-400 animate-pulse";
                  if (img.status === 'success') dotColor = "bg-emerald-500";
                  if (img.status === 'failed') dotColor = "bg-rose-500";

                  return (
                    <button
                      key={img.id}
                      onClick={() => scrollToLabel(idx)}
                      style={{ contentVisibility: 'auto' }}
                      className={`relative flex items-center justify-between w-full max-w-[50px] aspect-square rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/80 shadow-md transform scale-105' 
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="mx-auto">{idx + 1}</span>
                      {/* Corner state status dot */}
                      <span className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Narrative Scripts Recap Output */}
            <div 
              ref={rightPanelRef}
              className="w-[45%] h-full overflow-y-auto px-6 py-6 bg-slate-950/10"
            >
              {/* Transparent header to completely avoid the visual "bridge" cutting across */}
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800/60">
                <h2 className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono">Naskah Hasil Recap</h2>
                
                {images.some(img => img.status === 'success' && img.naskah) && (
                  <button
                    onClick={copyAllScripts}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono tracking-tight cursor-pointer rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    {copyAllSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Tersalin!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Salin Semua Naskah
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {images.map((img, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  const isSuccess = img.status === 'success' && img.naskah;

                  return (
                    <div
                      key={img.id}
                      id={`naskah-card-${idx}`}
                      className={`relative min-h-[160px] rounded-xl border p-5 transition-all duration-300 ${
                        isHighlighted 
                          ? 'border-indigo-500 bg-indigo-950/10 shadow-md' 
                          : 'border-slate-800/65 bg-slate-950/45'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/40">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                            #{idx + 1}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 truncate max-w-[220px]" title={img.name}>
                            {img.name}
                          </span>
                        </div>

                        {img.naskah && (
                          <button
                            onClick={() => copyToClipboard(img.naskah!, idx)}
                            className="p-1 px-2 rounded hover:bg-slate-800 text-slate-450 hover:text-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                            title="Salin Naskah Ini"
                          >
                            {copiedIndex === idx ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span className="text-[10px] font-mono">Salin</span>
                          </button>
                        )}
                      </div>

                      {/* Naskah Content render engine */}
                      {img.status === 'processing' ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                          <span className="text-[10px] font-mono tracking-wider animate-pulse">Menghasilkan narasi cerita...</span>
                        </div>
                      ) : img.status === 'failed' ? (
                        <div className="text-rose-455/90 text-xs py-4 flex flex-col gap-1 items-center justify-center text-center">
                          <AlertTriangle className="w-6 h-6 stroke-[1.5] text-rose-500/80 mb-1" />
                          <span>Gagal merangkum bagian ini.</span>
                          <button 
                            onClick={startRecapGeneration}
                            className="mt-2 text-[10px] underline hover:text-white cursor-pointer"
                          >
                            Gunakan tombol generate untuk coba lagi
                          </button>
                        </div>
                      ) : isSuccess ? (
                        /* Standard markdown-like paragraphs split by enterprise tags */
                        <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4">
                          {img.naskah!.split(/\n+/).map((p, pIdx) => {
                            const trimmed = p.trim();
                            if (!trimmed) return null;
                            return (
                              <p 
                                key={pIdx} 
                                className="text-slate-200 font-serif leading-relaxed text-justify tracking-wide selection:bg-indigo-500/30"
                              >
                                {trimmed}
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600 h-28 border border-dashed border-slate-900 rounded-lg">
                          <FileText className="w-6 h-6 mb-1.5 stroke-[1.2]" />
                          <span className="text-[10px] tracking-wide font-mono">Menunggu Analisis</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Modal Buat Projek Baru */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-2 text-indigo-400">
                <FolderOpen className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">Buat Projek Baru</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Silakan masukkan nama projek rangkuman manga Anda.
              </p>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Contoh: Saikyou Mahoushi Chapter 5"
                className="w-full text-xs px-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-505"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createNewProject(newProjectName);
                    setShowCreateModal(false);
                  }
                }}
              />
              <div className="flex gap-2.5 justify-end mt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    createNewProject(newProjectName);
                    setShowCreateModal(false);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-semibold rounded text-xs transition-all cursor-pointer shadow"
                >
                  Buat Projek
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Hapus Projek */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-slate-100">Hapus Projek</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Apakah Anda yakin ingin menghapus projek <span className="font-bold text-slate-100 font-mono">"{projectToDelete.name}"</span> beserta seluruh data naskah & gambarnya?
              </p>
              <p className="text-[11px] text-rose-400 font-medium bg-rose-950/20 border border-rose-900/30 p-2.5 rounded-lg leading-relaxed">
                Tindakan ini permanen dan tidak dapat dibatalkan di kemudian hari.
              </p>
              <div className="flex gap-2.5 justify-end mt-2">
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDeleteProject}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-xs transition-colors cursor-pointer shadow-md shadow-rose-950/20"
                >
                  Ya, Hapus Permanen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Alert Pemberitahuan */}
      <AnimatePresence>
        {alertMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-100">Pemberitahuan</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {alertMessage}
              </p>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setAlertMessage(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded text-xs transition-colors cursor-pointer"
                >
                  Dimengerti
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Elegant minimalist utility status footer */}
      <footer className="px-6 py-2 bg-slate-950 border-t border-slate-900 shrink-0 select-none text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>HOST: api.kie.ai</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Active Model: {settings.model}</span>
        </div>
        <div>
          <span>Manga Setup: Right-to-Left Read Direction</span>
        </div>
      </footer>

    </div>
  );
}
