import os
import shutil
import re

patch_file = 'patches/01a003f2-c282-79cc-ada8-33619cd39bd0.patch'
godot_dir = 'godot'
os.makedirs(godot_dir, exist_ok=True)

with open(patch_file, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Split diffs
diffs = re.split(r'(?=diff --git )', content)
print(f"Total diff sections: {len(diffs)}")

text_files_extracted = 0

for diff in diffs:
    if not diff.startswith('diff --git '):
        continue
    header_match = re.match(r'diff --git a/(.*?) b/(.*?)\n', diff)
    if not header_match:
        continue
    
    src_path = header_match.group(1)
    dst_path = header_match.group(2)
    
    if not dst_path.startswith('godot/'):
        continue

    # If it's a binary file
    if 'Binary files' in diff or 'GIT binary patch' in diff:
        continue

    # Extract text file content
    # Look for @@ lines
    hunk_match = re.search(r'@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*?\n(.*)', diff, re.DOTALL)
    if not hunk_match:
        continue

    hunk_body = hunk_match.group(1)
    file_lines = []
    for line in hunk_body.splitlines():
        if line.startswith('+'):
            file_lines.append(line[1:])
        elif line.startswith(' '):
            file_lines.append(line[1:])
        elif line.startswith('-'):
            continue
        elif line.startswith('\\ No newline at end of file'):
            continue
        elif line.startswith('@@ '):
            # another hunk header, ignore header line
            continue

    out_file = dst_path
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as out_f:
        out_f.write('\n'.join(file_lines))
    text_files_extracted += 1
    print(f"Extracted: {out_file}")

print(f"\nExtracted {text_files_extracted} Godot project files.")

# Now copy models and assets from public/assets to godot/assets
src_models = 'public/assets/models'
dst_models = 'godot/assets/models'
if os.path.exists(src_models):
    os.makedirs(dst_models, exist_ok=True)
    for fn in os.listdir(src_models):
        shutil.copy2(os.path.join(src_models, fn), os.path.join(dst_models, fn))
    print(f"Copied {len(os.listdir(dst_models))} 3D models to {dst_models}")

src_surfaces = 'public/assets/surfaces'
dst_surfaces = 'godot/assets/surfaces'
if os.path.exists(src_surfaces):
    os.makedirs(dst_surfaces, exist_ok=True)
    for fn in os.listdir(src_surfaces):
        shutil.copy2(os.path.join(src_surfaces, fn), os.path.join(dst_surfaces, fn))
    print(f"Copied {len(os.listdir(dst_surfaces))} surfaces to {dst_surfaces}")

src_hdri = 'public/assets/hdri'
dst_hdri = 'godot/assets/hdri'
if os.path.exists(src_hdri):
    os.makedirs(dst_hdri, exist_ok=True)
    for fn in os.listdir(src_hdri):
        shutil.copy2(os.path.join(src_hdri, fn), os.path.join(dst_hdri, fn))
    print(f"Copied {len(os.listdir(dst_hdri))} HDRIs to {dst_hdri}")

src_audio = 'public/assets/audio'
dst_audio = 'godot/assets/audio'
if os.path.exists(src_audio):
    os.makedirs(dst_audio, exist_ok=True)
    for fn in os.listdir(src_audio):
        shutil.copy2(os.path.join(src_audio, fn), os.path.join(dst_audio, fn))
    print(f"Copied {len(os.listdir(dst_audio))} audio files to {dst_audio}")
