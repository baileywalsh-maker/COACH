"""Writes tests/cam.y4m: an unknown EAN-13 for 5s, then Coca-Cola (in the UK packets).
Usage: python3 make_barcodes.py OUTDIR   (needs Pillow and ffmpeg)"""
import sys, subprocess, os
from PIL import Image, ImageDraw
L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
PAR=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
def chk(s): t=sum(int(c)*(3 if i%2 else 1) for i,c in enumerate(s[:12])); return str((10-t%10)%10)
def img(code12, path):
    code=code12+chk(code12); bits='101'; par=PAR[int(code[0])]
    for i,c in enumerate(code[1:7]): bits+=(L if par[i]=='L' else G)[int(c)]
    bits+='01010'
    for c in code[7:]: bits+=R[int(c)]
    bits+='101'
    im=Image.new('RGB',(1280,720),'white'); d=ImageDraw.Draw(im); w=5; x0=(1280-len(bits)*w)//2
    for i,b in enumerate(bits):
        if b=='1': d.rectangle([x0+i*w,220,x0+i*w+w-1,500],fill='black')
    im.save(path); return code
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
a=img('501234567890',out+'/a.png'); b=img('544900000099',out+'/b.png')
subprocess.run(['ffmpeg','-loglevel','error','-y','-loop','1','-t','5','-i',out+'/a.png','-loop','1','-t','30','-i',out+'/b.png',
  '-filter_complex','[0][1]concat=n=2:v=1,format=yuv420p,fps=15','-f','yuv4mpegpipe',out+'/cam.y4m'],check=True)
print(a,b)
