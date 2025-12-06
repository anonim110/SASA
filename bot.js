import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Send, Image as ImageIcon, Mic, Video, X, 
  Loader2, Play, Pause, Smile, MoreVertical, 
  Sticker
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";

// --- Configuration (Используем переменные окружения) ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Utility Components ---

// 1. Sticker Creator Modal
const StickerCreatorModal = ({ onClose, onSendSticker }) => {
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const PREVIEW_SIZE = 200;
  const CANVAS_SIZE = 512; // High resolution for sticker creation

  useEffect(() => {
    if (imageFile) {
      drawSticker();
    }
  }, [imageFile]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
    } else {
      setImageFile(null);
    }
  };

  const drawSticker = () => {
    if (!imageFile) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        const minDim = Math.min(img.width, img.height);
        const offsetX = (img.width - minDim) / 2;
        const offsetY = (img.height - minDim) / 2;

        const center = CANVAS_SIZE / 2;
        const radius = CANVAS_SIZE / 2;

        // 1. Apply Shadow (Glow)
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 40; 
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // 2. Draw the circular image path
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, radius - 20, 0, Math.PI * 2); // Reduced radius for border
        ctx.clip();
        
        ctx.drawImage(img, offsetX, offsetY, minDim, minDim, 10, 10, CANVAS_SIZE - 20, CANVAS_SIZE - 20);
        ctx.restore();
        
        // 3. Draw thick white border (outline)
        ctx.shadowColor = 'transparent'; // Disable shadow for the border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.arc(center, center, radius - 12.5, 0, Math.PI * 2);
        ctx.stroke();

        // 4. Draw transparent shadow for depth (optional)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20; 
        ctx.shadowOffsetY = 10;
        ctx.beginPath();
        ctx.arc(center, center, radius - 15, 0, Math.PI * 2);
        ctx.stroke();

      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(imageFile);
  };

  const handleSend = () => {
    if (!imageFile || !canvasRef.current) return;
    
    setLoading(true);
    // Get the final base64 string from the canvas
    const dataUrl = canvasRef.current.toDataURL('image/png');

    // Check size (Firestore limit ~1MB)
    if (dataUrl.length > 1000000) {
      console.error("Стикер слишком большой для отправки!");
      setLoading(false);
      onClose();
      return;
    }

    onSendSticker(dataUrl);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 p-6 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sticker size={24} className="text-pink-400" />
            Создать Стикер
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          
          <div className={`relative w-[${PREVIEW_SIZE}px] h-[${PREVIEW_SIZE}px] mb-6 overflow-hidden border-4 border-gray-700 rounded-2xl flex items-center justify-center bg-gray-800`}>
             <canvas 
               ref={canvasRef} 
               width={CANVAS_SIZE} 
               height={CANVAS_SIZE} 
               style={{ width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px`, display: imageFile ? 'block' : 'none' }}
             />
             {!imageFile && (
                <p className="text-gray-500 text-center p-4">Нажмите ниже, чтобы выбрать фото</p>
             )}
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 rounded-xl transition mb-4 border border-gray-700"
          >
            {imageFile ? 'Выбрать другое фото' : 'Выбрать Фото'}
          </button>
        </div>

        <button 
          onClick={handleSend} 
          disabled={!imageFile || loading}
          className="w-full bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white font-bold py-3 rounded-xl transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Отправить Стикер'}
        </button>
      </div>
    </div>
  );
};

// 2. Message Bubble Component
const MessageBubble = ({ msg, isOwn }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRef = useRef(null);

  const formatTime = (ts) => {
    if (!ts) return '...';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle media ended event
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onEnded = () => setIsPlaying(false);
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, []);

  // Determine content type and rendering
  let content;
  const commonClasses = "relative p-3 rounded-2xl shadow-md overflow-hidden";
  const ownBubbleStyle = 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-none';
  const otherBubbleStyle = 'bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700';
  const bubbleClasses = isOwn ? ownBubbleStyle : otherBubbleStyle;

  if (msg.type === 'text') {
    content = <p className="text-sm sm:text-base leading-relaxed break-words">{msg.text}</p>;
  } else if (msg.type === 'image') {
    content = (
      <img 
        src={msg.content} 
        alt="Sent" 
        className="rounded-lg max-h-64 object-cover w-full cursor-pointer hover:opacity-95 transition"
      />
    );
  } else if (msg.type === 'sticker') {
    // Stickers are treated differently - they are not inside a bubble, they are standalone
    return (
      <div className={`flex w-full mb-4 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="flex flex-col items-start max-w-[50%]">
          {!isOwn && (
            <span className="text-xs text-gray-400 ml-1 mb-1 font-medium">{msg.senderName}</span>
          )}
          <img 
            src={msg.content} 
            alt="Sticker" 
            className="w-24 h-24 sm:w-32 sm:h-32 object-contain cursor-pointer transition transform hover:scale-105"
            draggable="false"
          />
          <div className={`text-[10px] mt-1 ${isOwn ? 'text-indigo-400' : 'text-gray-500'} self-end`}>
            {formatTime(msg.timestamp)}
          </div>
        </div>
      </div>
    );
  } else if (msg.type === 'audio') {
    content = (
      <div className="flex items-center gap-3 min-w-[150px]">
        <button 
          onClick={togglePlay}
          className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="flex flex-col">
          <span className="text-xs opacity-80">Голосовое</span>
          <audio ref={mediaRef} src={msg.content} className="hidden" />
        </div>
        <div className="flex gap-0.5 items-center h-4 ml-2">
           {[...Array(8)].map((_, i) => (
             <div key={i} className="w-1 bg-white/50 rounded-full animate-pulse" style={{height: `${Math.random() * 100}%`}}></div>
           ))}
        </div>
      </div>
    );
  } else if (msg.type === 'video') {
    content = (
      <div className="relative">
        <video 
          ref={mediaRef}
          src={msg.content} 
          className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white/20"
          onClick={togglePlay}
        />
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/40 p-2 rounded-full backdrop-blur-sm">
              <Play size={20} className="text-white" fill="white" />
            </div>
          </div>
        )}
      </div>
    );
  } else {
    content = <p className="text-sm italic text-gray-500">Неизвестный тип сообщения</p>;
  }

  return (
    <div className={`flex w-full mb-4 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] sm:max-w-[60%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && (
          <span className="text-xs text-gray-400 ml-1 mb-1 font-medium">{msg.senderName}</span>
        )}
        
        <div className={`${commonClasses} ${bubbleClasses}`}>
          {content}
          <div className={`text-[10px] mt-1 text-right ${isOwn ? 'text-indigo-200' : 'text-gray-500'}`}>
            {formatTime(msg.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. Auth Modal (Unchanged)
const AuthModal = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    onJoin(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
            <Smile size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Добро пожаловать</h2>
          <p className="text-gray-400">Введите имя, чтобы войти в чат</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя..."
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            maxLength={20}
          />
          <button 
            type="submit" 
            disabled={loading || !name.trim()}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 rounded-xl transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Войти в чат'}
          </button>
        </form>
      </div>
    </div>
  );
};

// 4. Main App Component
export default function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null); // 'audio' | 'video'
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showStickerModal, setShowStickerModal] = useState(false); // New State
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const streamRef = useRef(null);

  // --- Auth & Setup ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleJoin = async (displayName) => {
    try {
      // Использование токена для аутентификации (Fix for permissions)
      const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
      if (token) {
         await signInWithCustomToken(auth, token);
      } else {
         await signInAnonymously(auth);
      }
      
      // Обновляем отображаемое имя
      if (auth.currentUser) {
         const updatedUser = { ...auth.currentUser, displayName: displayName };
         setUser(updatedUser);
         try {
           await updateProfile(auth.currentUser, { displayName: displayName });
         } catch (e) {
           console.log("Could not update profile display name:", e);
         }
      }
    } catch (error) {
      console.error("Auth error:", error);
    }
  };

  // --- Firestore Listener ---
  useEffect(() => {
    if (!user) return; // Ждем успешной аутентификации

    const q = collection(db, 'artifacts', appId, 'public', 'data', 'chat_messages');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Сортируем по метке времени в памяти
      msgs.sort((a, b) => {
         const ta = a.timestamp?.seconds || 0;
         const tb = b.timestamp?.seconds || 0;
         return ta - tb;
      });
      setMessages(msgs);
      scrollToBottom();
    }, (err) => {
        console.error("Snapshot error:", err);
    });

    return () => unsubscribe();
  }, [user]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // --- Sending Logic ---
  const sendMessage = async (content, type = 'text') => {
    if (!content) return;
    
    // Используем актуальное имя пользователя
    const senderName = user.displayName || 'Аноним';

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chat_messages'), {
        text: type === 'text' ? content : null,
        content: type !== 'text' ? content : null,
        type: type,
        senderId: user.uid,
        senderName: senderName,
        timestamp: serverTimestamp()
      });
      if (type === 'text') {
        setInputText('');
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handleSendSticker = (base64Data) => {
    sendMessage(base64Data, 'sticker');
  };

  // --- Media Helpers ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // Сброс

    // Сжатие изображения
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.7); 
        sendMessage(base64, 'image');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async (type) => {
    try {
      const constraints = type === 'video' 
        ? { video: { facingMode: "user", width: 300, height: 300 }, audio: true }
        : { audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (type === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: type === 'video' ? 'video/webm' : 'audio/webm'
      });

      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result;
            if (base64data.length > 1000000) {
                console.error("Файл слишком большой! Попробуйте записать короче.");
            } else {
                sendMessage(base64data, type);
            }
        };
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecordingType(type);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
            const limit = type === 'video' ? 5 : 30;
            if (prev >= limit) {
                stopRecording();
                return prev;
            }
            return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Media error:", err);
      console.error("Не удалось получить доступ к микрофону или камере.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingType(null);
  };

  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop(); 
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingType(null);
  };

  // --- Render ---

  if (!user || !user.uid) { 
    return <AuthModal onJoin={handleJoin} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      
      {showStickerModal && (
        <StickerCreatorModal 
          onClose={() => setShowStickerModal(false)} 
          onSendSticker={handleSendSticker}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <Smile size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Общий Чат</h1>
            <div className="flex items-center gap-1.5">
               <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
               <p className="text-xs text-gray-400">Онлайн</p>
            </div>
          </div>
        </div>
        <div className="p-2 bg-gray-800 rounded-full cursor-pointer hover:bg-gray-700 transition">
           <MoreVertical size={20} className="text-gray-400" />
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
             <Sticker size={48} className="mb-2 text-pink-500" />
             <p>Здесь пока пусто. Начни общение!</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble 
              key={msg.id} 
              msg={msg} 
              isOwn={msg.senderId === user.uid} 
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Recording Overlay */}
      {isRecording && (
        <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
           {recordingType === 'video' && (
             <div className="relative mb-6">
                <video 
                   ref={videoPreviewRef} 
                   className="w-48 h-48 rounded-full object-cover border-4 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                   muted 
                />
                <div className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full animate-ping"></div>
             </div>
           )}
           {recordingType === 'audio' && (
             <div className="mb-8 p-6 bg-red-500/20 rounded-full animate-pulse">
                <Mic size={48} className="text-red-500" />
             </div>
           )}
           
           <div className="text-2xl font-mono font-bold text-white mb-8">
             00:0{recordingTime} <span className="text-sm text-gray-400 font-normal">/ 00:0{recordingType === 'video' ? 5 : 30}</span>
           </div>

           <div className="flex items-center gap-8">
             <button 
                onClick={cancelRecording}
                className="p-4 bg-gray-700 rounded-full hover:bg-gray-600 transition"
             >
                <X size={24} />
             </button>
             <button 
                onClick={stopRecording}
                className="p-6 bg-red-500 rounded-full hover:bg-red-600 transition transform hover:scale-110 shadow-lg shadow-red-500/30"
             >
                <Send size={28} fill="white" />
             </button>
           </div>
           <p className="mt-4 text-gray-400 text-sm">Нажмите стоп для отправки</p>
        </div>
      )}

      {/* Input Area */}
      <footer className="p-3 bg-gray-900 border-t border-gray-800">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          
          {/* Sticker Button (New) */}
          <button 
             onClick={() => setShowStickerModal(true)}
             className="p-3 text-gray-400 hover:text-pink-400 hover:bg-gray-800 rounded-xl transition"
             title="Создать стикер из фото"
          >
             <Sticker size={24} />
          </button>
          
          {/* Attach Button (Image) */}
          <button 
             onClick={() => fileInputRef.current?.click()}
             className="p-3 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-xl transition"
             title="Отправить фото"
          >
             <ImageIcon size={24} />
             <input 
               type="file" 
               accept="image/*" 
               className="hidden" 
               ref={fileInputRef} 
               onChange={handleFileUpload} 
             />
          </button>

          {/* Text Input */}
          <div className="flex-1 bg-gray-800 rounded-2xl flex items-center px-4 py-2 border border-gray-700 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition">
             <textarea 
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
               placeholder="Сообщение..."
               className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 resize-none max-h-24 py-2"
               rows={1}
               onKeyDown={(e) => {
                 if(e.key === 'Enter' && !e.shiftKey) {
                   e.preventDefault();
                   sendMessage(inputText);
                 }
               }}
             />
          </div>

          {/* Action Buttons */}
          {inputText.trim() ? (
            <button 
              onClick={() => sendMessage(inputText)}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition shadow-lg shadow-indigo-600/20 transform active:scale-95"
            >
              <Send size={20} />
            </button>
          ) : (
            <div className="flex gap-1">
              <button 
                onClick={() => startRecording('video')}
                className="p-3 text-gray-400 hover:text-pink-400 hover:bg-gray-800 rounded-full transition"
                title="Записать кружок"
              >
                <Video size={24} />
              </button>
              <button 
                onClick={() => startRecording('audio')}
                className="p-3 text-gray-400 hover:text-teal-400 hover:bg-gray-800 rounded-full transition"
                title="Записать голос"
              >
                <Mic size={24} />
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}