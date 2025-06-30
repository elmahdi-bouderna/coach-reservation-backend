const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configure multer for temporary storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/temp'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Create uploads/temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ storage: storage });

// ImgBB API key
const API_KEY = '707cfa8cb92880c80b9154c7135498d6';

// Route to proxy image uploads to ImgBB
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Create form data for ImgBB
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));

    // Send to ImgBB
    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${API_KEY}`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        }
      }
    );

    // Clean up the temporary file
    fs.unlinkSync(req.file.path);

    // Return the ImgBB response
    return res.json(response.data);
  } catch (error) {
    console.error('Error uploading to ImgBB:', error);
    
    // Clean up the temporary file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({ 
      error: 'Failed to upload image',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
