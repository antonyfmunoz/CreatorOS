import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure uploads directory exists
const uploadDir = process.env.CREATOROS_UPLOAD_DIR
  ? path.resolve(process.env.CREATOROS_UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');
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
    } else if (file.fieldname === 'cut-lut') {
      prefix = 'cut-lut';
    } else if (file.fieldname === 'font') {
      prefix = 'cut-font';
    } else if (file.fieldname === 'lottie') {
      prefix = 'cut-lottie';
    } else if (file.fieldname === 'rive') {
      prefix = 'cut-rive';
    } else if (file.fieldname === 'code_source') {
      prefix = 'cut-code-source';
    } else if (file.fieldname === 'code_lockfile') {
      prefix = 'cut-code-lockfile';
    } else if (file.fieldname === 'benchmark-evidence') {
      prefix = 'benchmark-evidence';
    } else if (file.fieldname === 'media') {
      // For story uploads
      prefix = file.mimetype.startsWith('video/') ? 'story-video' : 'story-image';
    }
    
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

// File filter function that adapts based on the field name
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Determine allowed types based on the file type that comes from MediaType parameter
  // or fall back to the field name if not specified
  const mediaType = req.body.mediaType || file.fieldname;
  
  // Add support for 'media' field used for story uploads
  if (file.fieldname === 'media') {
    // For story media uploads - allow both images and videos
    const imageTypes = /jpeg|jpg|png|gif|webp/;
    const videoTypes = /mp4|webm|mov|avi/;
    
    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    const isImageExt = imageTypes.test(ext);
    const isVideoExt = videoTypes.test(ext);
    
    // Check mime type
    const isImageMime = file.mimetype.startsWith('image/');
    const isVideoMime = file.mimetype.startsWith('video/');
    
    if ((isImageExt && isImageMime) || (isVideoExt && isVideoMime)) {
      return cb(null, true);
    } else {
      cb(new Error('Only image or video files are allowed for stories!'));
    }
  } else if (mediaType === 'photo' || file.fieldname === 'profile' || file.fieldname === 'image' || file.fieldname.startsWith('image')) {
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
    const allowedTypes = /mp3|wav|ogg|webm|m4a|aac|flac/;
    // Check extension
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type (more permissive for audio)
    const isAudio = file.mimetype.startsWith('audio/') || 
                    file.mimetype === 'application/octet-stream'; // For some webm recordings

    if (isAudio && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'));
    }
  } else if (file.fieldname === 'cut-lut') {
    const isCube = path.extname(file.originalname).toLowerCase() === '.cube';
    const isText = file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream' || file.mimetype === 'application/x-cube';
    if (isCube && isText) return cb(null, true);
    cb(new Error('Only .cube 3D LUT files are allowed!'));
  } else if (file.fieldname === 'font') {
    const extension = path.extname(file.originalname).toLowerCase();
    const isSfntExtension = extension === '.ttf' || extension === '.otf';
    const isFontMime = /^(font\/(ttf|otf|sfnt)|application\/(font-sfnt|x-font-ttf|x-font-opentype|octet-stream))$/i.test(file.mimetype);
    if (isSfntExtension && isFontMime) return cb(null, true);
    cb(new Error('Only TTF or OTF font files are allowed!'));
  } else if (file.fieldname === 'lottie') {
    const isJson = path.extname(file.originalname).toLowerCase() === '.json';
    const isJsonMime = /^(application\/(json|lottie\+json)|text\/json)$/i.test(file.mimetype);
    if (isJson && isJsonMime) return cb(null, true);
    cb(new Error('Only Lottie JSON files are allowed!'));
  } else if (file.fieldname === 'rive') {
    const isRive = path.extname(file.originalname).toLowerCase() === '.riv';
    const isRiveMime = /^application\/(octet-stream|x-rive|vnd\.rive)$/i.test(file.mimetype);
    if (isRive && isRiveMime) return cb(null, true);
    cb(new Error('Only Rive .riv files are allowed!'));
  } else if (file.fieldname === 'code_source') {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMime = /^(application\/(zip|x-zip-compressed)|multipart\/x-zip)$/i.test(file.mimetype);
    if (extension === '.zip' && allowedMime) return cb(null, true);
    cb(new Error('Only ZIP source capsules are allowed!'));
  } else if (file.fieldname === 'code_lockfile') {
    const filename = path.basename(file.originalname).toLowerCase();
    const allowedName = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(filename);
    const allowedMime = /^(application\/(json|octet-stream)|text\/(plain|yaml|x-yaml))$/i.test(file.mimetype);
    if (allowedName && allowedMime) return cb(null, true);
    cb(new Error('Only npm, pnpm, or Yarn lockfiles are allowed!'));
  } else if (file.fieldname === 'benchmark-evidence') {
    // Manifests, logs, output artifacts, and run recordings intentionally use
    // different MIME families. Asset policy enforces the bounded private
    // download contract after multer accepts the single evidence file.
    return cb(null, true);
  } else if (file.fieldname === 'video') {
    // For video uploads
    const allowedTypes = /mp4|webm|mov|avi/;
    // Check extension
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const isVideo = file.mimetype.startsWith('video/');

    if (isVideo && extname) {
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
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: fileFilter
});

export default upload;
