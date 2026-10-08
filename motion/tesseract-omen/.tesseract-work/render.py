"""Render every output frame with the exact public Tesseract CLI, then encode VP9 alpha."""
import os,subprocess,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
frames=root/'.tesseract-work/frames';frames.mkdir(exist_ok=True)
env=os.environ.copy()
cli=os.environ.get('TESSERACT_CLI', str(Path.home()/'.local/share/Tesseract/bin/tsrct'))
def render(i):
 subprocess.run([cli,'preview','--project',str(root/'AgendaOmen.tsrct'),'--time',str(i/30),'--output',str(frames/f'{i:04d}.png')],check=True,env=env,stdout=subprocess.DEVNULL)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(render,range(54)))
print('Rendered 54 real native frames at 30 fps')
