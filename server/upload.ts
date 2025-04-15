import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Add prefix based on file type (profile, image, audio, video)
    let prefix = 'file';
    
    if (file.fieldname === 'profile') {
      prefix = 'profile';
    } else if (file.fieldname === 'image') {
      prefix = 'image';
    } else if (file.fieldname === 'audio') {
      prefix = 'audio';
    } else if (file.fieldname === 'video') {
      prefix = 'video';
    }
    
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

// File filter function that adapts based on the field name
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Determine allowed types based on the file type that comes from MediaType parameter
  // or fall back to the field name if not specified
  const mediaType = req.body.mediaType || file.fieldname;
  
  if (mediaType === 'photo' || file.fieldname === 'profile' || file.fieldname === 'image' || file.fieldname.startsWith('image')) {
    // For profile pictures and post images
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    // Check extension
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  } else if (file.fieldname === 'audio') {
    // For audio uploads
    const allowedTypes = /mp3|wav|ogg|webm/;
    // Check extension
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type (more permissive for audio)
    const isAudio = file.mimetype.startsWith('audio/') || 
                    file.mimetype === 'application/octet-stream'; // For some webm recordings

    if (isAudio || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'));
    }
  } else if (file.fieldname === 'video') {
    // For video uploads
    const allowedTypes = /mp4|webm|mov|avi/;
    // Check extension
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const isVideo = file.mimetype.startsWith('video/');

    if (isVideo || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'));
    }
  } else {
    // Default for other file types
    cb(new Error('Unexpected file field'));
  }
};

// Create the multer upload instance
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

export default upload;