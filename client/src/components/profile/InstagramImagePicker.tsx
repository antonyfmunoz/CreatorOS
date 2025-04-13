import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Camera, Image as ImageIcon } from "lucide-react";

interface InstagramImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onImageSelected: (file: File) => void;
}

export default function InstagramImagePicker({
  isOpen,
  onClose,
  onImageSelected
}: InstagramImagePickerProps) {
  const [step, setStep] = useState<'library' | 'crop'>('library');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [imgSrc, setImgSrc] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open system file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // When file is selected from the system file picker
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    // Read the file to display it
    const reader = new FileReader();
    reader.onloadend = () => {
      setImgSrc(reader.result as string);
      setStep('crop'); // Move to cropping step
    };
    reader.readAsDataURL(file);
  };

  // Create initial centered crop
  const createFixedCenterCrop = useCallback((mediaWidth: number, mediaHeight: number) => {
    const size = Math.min(mediaWidth, mediaHeight);
    const x = (mediaWidth - size) / 2;
    const y = (mediaHeight - size) / 2;
    
    return {
      unit: 'px',
      x,
      y,
      width: size,
      height: size,
    } as Crop;
  }, []);

  // When image loads, set up initial crop
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const initialCrop = createFixedCenterCrop(width, height);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  }

  // Apply the crop and pass it to the parent
  async function handleDone() {
    if (!imgRef.current || !completedCrop || !selectedFile) return;
    
    try {
      const croppedFile = await getCroppedImg();
      if (croppedFile) {
        onImageSelected(croppedFile);
        onClose();
        
        // Reset state for next time
        setTimeout(() => {
          setStep('library');
          setImgSrc("");
          setSelectedFile(null);
          setCrop(undefined);
          setCompletedCrop(undefined);
        }, 100);
      }
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  }

  // Return to library view
  function handleCancel() {
    if (step === 'library') {
      onClose();
    } else {
      setStep('library');
      setImgSrc("");
      setSelectedFile(null);
    }
  }

  // Convert the cropped area to a File object
  const getCroppedImg = useCallback(() => {
    if (!imgRef.current || !completedCrop || !selectedFile) return null;
    
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Set canvas size to be square
    const size = completedCrop.width;
    canvas.width = size;
    canvas.height = size;
    
    // Create a circular clipping path
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.clip();
    
    // Draw the cropped image onto the canvas
    ctx.drawImage(
      image,
      completedCrop.x,
      completedCrop.y,
      completedCrop.width,
      completedCrop.height,
      0,
      0,
      size,
      size
    );
    
    // Convert canvas to blob
    return new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `profile-${Date.now()}.png`, { 
          type: "image/png" 
        });
        resolve(file);
      }, 'image/png', 0.95);
    });
  }, [completedCrop, selectedFile]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button 
          onClick={handleCancel}
          className="text-white hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <div className="font-semibold text-center text-white">
          {step === 'library' ? 'Library' : '1 Photo Selected'}
        </div>
        {step === 'crop' ? 
          <button 
            onClick={handleDone}
            className="text-blue-500 hover:text-blue-400 transition-colors"
            disabled={!completedCrop}
          >
            Done
          </button>
         : 
          <div style={{ width: '42px' }}></div>
        }
      </div>
      
      {/* Main Content */}
      {step === 'library' ? (
        // Library View
        <div className="flex flex-col h-[calc(100%-57px)]">
          <div 
            className="flex-1 flex items-center justify-center bg-gray-900 p-6"
            onClick={openFilePicker}
          >
            <div className="text-center">
              <ImageIcon size={64} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400">Tap to select a photo from your library</p>
            </div>
          </div>
          
          {/* Footer Buttons */}
          <div className="grid grid-cols-2 border-t border-gray-800">
            <button 
              className="py-4 text-center flex flex-col items-center justify-center gap-1 text-white hover:bg-gray-900"
              onClick={openFilePicker}
            >
              <ImageIcon size={24} className="text-gray-300" />
              <span>Photo Library</span>
            </button>
            <button 
              className="py-4 text-center flex flex-col items-center justify-center gap-1 text-white hover:bg-gray-900 border-l border-gray-800"
              onClick={openFilePicker}
            >
              <Camera size={24} className="text-gray-300" />
              <span>Take Photo</span>
            </button>
          </div>
          
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelected}
          />
        </div>
      ) : (
        // Crop View
        <div className="h-[calc(100%-57px)] bg-gray-900 flex items-center justify-center">
          {imgSrc && (
            <ReactCrop
              crop={crop}
              locked={true}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
              className="h-full w-full flex items-center justify-center"
            >
              <img
                ref={imgRef}
                alt="Upload"
                src={imgSrc}
                onLoad={onImageLoad}
                className="max-w-full max-h-full object-contain"
              />
            </ReactCrop>
          )}
        </div>
      )}
    </div>
  );
}