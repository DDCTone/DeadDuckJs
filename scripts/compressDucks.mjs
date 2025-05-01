#!/usr/bin/env node

/**
 * compressDucks.mjs
 * 
 * Script to compress WebP duck images in-place using the sharp library
 * This script will replace the original files with optimized versions
 * 
 * Usage: node scripts/compressDucks.mjs [quality] [backup]
 * - quality: Compression quality (1-100, default 80)
 * - backup: Set to "true" to create backups of original files (default: false)
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DUCKS_DIR = path.resolve(__dirname, '../public/images/ducks');
const BACKUP_DIR = path.resolve(__dirname, '../public/images/ducks-backup');
const DEFAULT_QUALITY = 80;

// Parse command line arguments
const quality = parseInt(process.argv[2]) || DEFAULT_QUALITY;
const createBackup = (process.argv[3] || '').toLowerCase() === 'true';

// Initialize statistics
const stats = {
  totalFiles: 0,
  processedFiles: 0,
  skippedFiles: 0,
  failedFiles: 0,
  originalSize: 0,
  compressedSize: 0,
  startTime: Date.now()
};

/**
 * Create a backup of the original file
 */
async function backupFile(filePath) {
  // Create backup directory if it doesn't exist
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  
  const fileName = path.basename(filePath);
  const backupPath = path.join(BACKUP_DIR, fileName);
  
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Compress a single WebP image
 */
async function compressImage(filePath) {
  const fileName = path.basename(filePath);
  
  try {
    // Get original file stats
    const fileStats = await fs.stat(filePath);
    stats.originalSize += fileStats.size;
    
    // Skip small files (already compressed)
    if (fileStats.size < 50 * 1024) { // 50KB
      console.log(`Skipping ${fileName} (already small: ${(fileStats.size / 1024).toFixed(2)}KB)`);
      stats.skippedFiles++;
      return;
    }
    
    // Create a backup if requested
    if (createBackup) {
      await backupFile(filePath);
    }
    
    // Create a temporary output path
    const tempFilePath = `${filePath}.temp`;
    
    // Use sharp to compress the image
    await sharp(filePath)
      .webp({
        quality: quality,
        effort: 6,             // Compression effort (0=fastest, 6=best)
        smartSubsample: true,  // Better chroma subsampling
        alphaQuality: 90       // Alpha layer quality
      })
      .toFile(tempFilePath);
    
    // Get compressed file stats
    const newStats = await fs.stat(tempFilePath);
    
    // Only replace if the compression reduced the file size
    if (newStats.size < fileStats.size) {
      // Replace the original file with the compressed version
      await fs.unlink(filePath);
      await fs.rename(tempFilePath, filePath);
      
      stats.compressedSize += newStats.size;
      
      // Calculate savings
      const savings = ((fileStats.size - newStats.size) / fileStats.size * 100).toFixed(2);
      const origKb = (fileStats.size / 1024).toFixed(2);
      const newKb = (newStats.size / 1024).toFixed(2);
      
      console.log(`Compressed ${fileName}: ${origKb}KB → ${newKb}KB (saved ${savings}%)`);
      stats.processedFiles++;
    } else {
      // No improvement, clean up the temp file
      await fs.unlink(tempFilePath);
      stats.compressedSize += fileStats.size;
      console.log(`Skipping ${fileName} (compression didn't reduce size)`);
      stats.skippedFiles++;
    }
  } catch (error) {
    console.error(`Failed to process ${fileName}: ${error.message}`);
    stats.failedFiles++;
    stats.compressedSize += (await fs.stat(filePath)).size; // Add original size to maintain accurate total
  }
}

/**
 * Main function to process all duck images
 */
async function processDuckImages() {
  console.log("======================================================");
  console.log("🦆 Duck Image Compression");
  console.log("======================================================");
  console.log(`Directory: ${DUCKS_DIR}`);
  console.log(`Quality setting: ${quality}`);
  console.log(`Creating backups: ${createBackup ? 'Yes' : 'No'}`);
  console.log("======================================================");
  
  try {
    // Get all WebP files in the ducks directory
    const files = await fs.readdir(DUCKS_DIR);
    const webpFiles = files.filter(file => file.toLowerCase().endsWith('.webp'));
    
    stats.totalFiles = webpFiles.length;
    console.log(`Found ${stats.totalFiles} WebP duck images to process`);
    
    // Process each file
    for (const file of webpFiles) {
      const filePath = path.join(DUCKS_DIR, file);
      await compressImage(filePath);
    }
    
    // Show summary
    const duration = (Date.now() - stats.startTime) / 1000;
    const totalSavings = ((stats.originalSize - stats.compressedSize) / stats.originalSize * 100).toFixed(2);
    const origMb = (stats.originalSize / 1048576).toFixed(2);
    const compMb = (stats.compressedSize / 1048576).toFixed(2);
    const spaceSaved = ((stats.originalSize - stats.compressedSize) / 1048576).toFixed(2);
    
    console.log("======================================================");
    console.log("Compression complete!");
    console.log(`Time taken: ${duration.toFixed(2)} seconds`);
    console.log(`Original size: ${origMb}MB`);
    console.log(`Compressed size: ${compMb}MB`);
    console.log(`Space saved: ${spaceSaved}MB (${totalSavings}%)`);
    console.log(`Successfully compressed: ${stats.processedFiles} files`);
    console.log(`Skipped: ${stats.skippedFiles} files`);
    
    if (stats.failedFiles > 0) {
      console.log(`Failed: ${stats.failedFiles} files`);
    }
    
    if (createBackup) {
      console.log(`Backup created in: ${BACKUP_DIR}`);
    }
    console.log("======================================================");
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Start processing
processDuckImages();