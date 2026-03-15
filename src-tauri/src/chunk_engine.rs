use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

use crate::error::PvError;

const SKIP_EXTENSIONS: &[&str] = &[
    "pts", "las", "laz", "pcd", "e57", "ptx", "xyb", "xyz",
];
const SKIP_DIRS: &[&str] = &[
    ".git", ".claude", "downloads", "node_modules", "target",
];
const CHUNKS_DIR: &str = ".pv_chunks";
/// Max uncompressed bytes per zip chunk (default chunk size ~50 MB).
/// Used as fallback when the caller does not supply a size.
#[allow(dead_code)]
const CHUNK_BYTES: u64 = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Scan `repo_path` for files larger than `max_size_mb` MB, split them into
/// zip chunks stored in `<repo_path>/.pv_chunks/`, update `.gitignore` to
/// exclude the originals and include the chunks.  Returns the list of chunk
/// files that were created.
pub async fn preprocess_large_files(
    repo_path: &str,
    max_size_mb: u64,
) -> Result<Vec<String>, PvError> {
    let repo_path = repo_path.to_string();
    let max_bytes = max_size_mb * 1024 * 1024;

    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&repo_path);
        let chunks_dir = root.join(CHUNKS_DIR);
        fs::create_dir_all(&chunks_dir)?;

        let mut created_chunks: Vec<String> = Vec::new();
        let mut gitignore_originals: Vec<String> = Vec::new();

        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !should_skip_dir(e.path()))
        {
            let entry = entry.map_err(|e| PvError::Io(std::io::Error::other(e.to_string())))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();

            // Skip skip-extension files (point clouds etc.)
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if SKIP_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                    continue;
                }
            }

            let metadata = fs::metadata(path)?;
            if metadata.len() <= max_bytes {
                continue;
            }

            // Compute a stable base name from the file path relative to root
            let rel = path.strip_prefix(&root).unwrap_or(path);
            let rel_str = rel.to_string_lossy().replace(['\\', '/'], "_");
            let hash_prefix = {
                let mut h = Sha256::new();
                h.update(rel.to_string_lossy().as_bytes());
                let digest = h.finalize();
                hex::encode(&digest[..4])
            };
            let base_name = format!("{}-{}", sanitize_name(&rel_str), hash_prefix);

            let new_chunks =
                split_file_to_chunks(path, &chunks_dir, &base_name, max_bytes)?;
            if !new_chunks.is_empty() {
                // Record original relative path for .gitignore
                gitignore_originals
                    .push(rel.to_string_lossy().replace('\\', "/").to_string());
                created_chunks.extend(new_chunks);
            }
        }

        if !gitignore_originals.is_empty() {
            update_gitignore(&root, &gitignore_originals)?;
        }

        Ok(created_chunks)
    })
    .await
    .map_err(|e| PvError::ChunkError(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn should_skip_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| SKIP_DIRS.contains(&n))
        .unwrap_or(false)
}

fn sanitize_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

/// Split a single large file into multiple zip chunks.
/// Each chunk is a zip archive named `<base_name>_part<N>.zip` stored in
/// `chunks_dir`.  Returns the (relative) paths of chunks created.
fn split_file_to_chunks(
    source: &Path,
    chunks_dir: &Path,
    base_name: &str,
    chunk_size: u64,
) -> Result<Vec<String>, PvError> {
    let mut source_file = File::open(source)?;
    let total_size = source_file.metadata()?.len();
    let file_name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let mut created: Vec<String> = Vec::new();
    let mut part = 0usize;
    let mut bytes_remaining = total_size;

    while bytes_remaining > 0 {
        let this_chunk = bytes_remaining.min(chunk_size);
        let chunk_path = chunks_dir.join(format!("{}_part{:03}.zip", base_name, part));

        let chunk_file = File::create(&chunk_path)?;
        let mut zip = ZipWriter::new(chunk_file);
        let options: FileOptions<()> =
            FileOptions::default().compression_method(CompressionMethod::Deflated);

        zip.start_file(format!("{}.part{:03}", file_name, part), options)
            .map_err(|e| PvError::ChunkError(e.to_string()))?;

        let mut buf = vec![0u8; this_chunk as usize];
        let n = source_file.read(&mut buf)?;
        buf.truncate(n);
        zip.write_all(&buf)?;

        zip.finish().map_err(|e| PvError::ChunkError(e.to_string()))?;

        let chunk_rel = format!(
            "{}/{}",
            CHUNKS_DIR,
            chunk_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        );
        created.push(chunk_rel);

        bytes_remaining -= n as u64;
        part += 1;

        if n == 0 {
            break;
        }
    }

    Ok(created)
}

/// Update (or create) `<root>/.gitignore`:
///  - Add the original oversized files to ignore list
///  - Ensure the `.pv_chunks/` directory is tracked (not ignored)
fn update_gitignore(root: &Path, originals: &[String]) -> Result<(), PvError> {
    let gitignore_path = root.join(".gitignore");

    let existing = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path)?
    } else {
        String::new()
    };

    let mut lines: Vec<String> = existing
        .lines()
        .map(|l| l.to_string())
        .collect();

    let mut changed = false;

    // Make sure chunks dir is NOT ignored (un-ignore it if needed)
    let chunks_track = format!("!{}/", CHUNKS_DIR);
    if !lines.iter().any(|l| l == &chunks_track) {
        // Remove any blanket ignore of chunks dir first
        lines.retain(|l| l != CHUNKS_DIR && l != &format!("{}/", CHUNKS_DIR));
        lines.push(chunks_track);
        changed = true;
    }

    for orig in originals {
        if !lines.iter().any(|l| l == orig) {
            lines.push(orig.clone());
            changed = true;
        }
    }

    if changed {
        let content = lines.join("\n") + "\n";
        fs::write(&gitignore_path, content)?;
    }

    Ok(())
}
