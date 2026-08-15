import os
import re
import shutil

patch_file = 'patches/01a003f2-c282-79cc-ada8-33619cd39bd0 (1).patch'
print(f"Reading {patch_file}...")

with open(patch_file, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

diffs = re.split(r'(?=diff --git )', content)
print(f"Total diff sections: {len(diffs)}")

count = 0
for diff in diffs:
    if not diff.startswith('diff --git '):
        continue
    header_match = re.match(r'diff --git a/(.*?) b/(.*?)\n', diff)
    if not header_match:
        continue
    
    dst_path = header_match.group(2).strip()
    if not dst_path.startswith('godot/'):
        continue

    if 'Binary files' in diff or 'GIT binary patch' in diff:
        continue

    # Split by hunk headers
    hunks = re.split(r'@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n', diff)
    if len(hunks) <= 1:
        continue

    file_lines = []
    # For each hunk body
    for hunk in hunks[1:]:
        for line in hunk.splitlines():
            if line.startswith('diff --git '):
                break
            if line.startswith('+'):
                file_lines.append(line[1:])
            elif line.startswith(' '):
                file_lines.append(line[1:])
            elif line.startswith('-'):
                continue
            elif line.startswith('\\ No newline'):
                continue

    out_file = dst_path
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as out_f:
        out_f.write('\n'.join(file_lines))
    count += 1
    print(f"Extracted ({count}): {out_file}")

print(f"\nExtracted {count} files from patch.")

# Make sure models, surfaces, and hdri are in godot/assets/
src_models = 'public/assets/models'
dst_models = 'godot/assets/models'
if os.path.exists(src_models):
    os.makedirs(dst_models, exist_ok=True)
    for fn in os.listdir(src_models):
        shutil.copy2(os.path.join(src_models, fn), os.path.join(dst_models, fn))
    print(f"Copied models to {dst_models}")

src_surfaces = 'public/assets/surfaces'
dst_surfaces = 'godot/assets/surfaces'
if os.path.exists(src_surfaces):
    os.makedirs(dst_surfaces, exist_ok=True)
    for fn in os.listdir(src_surfaces):
        shutil.copy2(os.path.join(src_surfaces, fn), os.path.join(dst_surfaces, fn))
    print(f"Copied surfaces to {dst_surfaces}")

src_hdri = 'public/assets/hdri'
dst_hdri = 'godot/assets/hdri'
if os.path.exists(src_hdri):
    os.makedirs(dst_hdri, exist_ok=True)
    for fn in os.listdir(src_hdri):
        shutil.copy2(os.path.join(src_hdri, fn), os.path.join(dst_hdri, fn))
    print(f"Copied HDRIs to {dst_hdri}")
