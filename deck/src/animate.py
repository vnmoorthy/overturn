"""Adds motion to the generated deck: a Morph slide transition (Fade fallback for older
PowerPoint) and auto-playing, staggered entrance animations for every shape whose name
starts with "anim" (named by build-deck.cjs). Usage: python3 animate.py deck.pptx"""
import re
import sys
import zipfile
import shutil
import tempfile

TRANSITION = (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
    '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" '
    'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p159">'
    '<p:transition spd="slow" p14:dur="1200"><p159:morph option="byObject"/></p:transition>'
    '</mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback>'
    '</mc:AlternateContent>'
)

ZOOM_WORDS = ('stat', 'callout-num', 'metric', 'qr', 'hero-art', 'closing', 'headline')


def effect(ids, spid, delay, kind):
    i = lambda: next(ids)
    vis = (f'<p:set><p:cBhvr><p:cTn id="{i()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
           f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
           f'<p:to><p:strVal val="visible"/></p:to></p:set>')
    fade = (f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{i()}" dur="600"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>')
    if kind == 'zoom':
        def scale(attr):
            return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{i()}" dur="600" fill="hold"/>'
                    f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>'
                    f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="0.6*#{attr}"/></p:val></p:tav>'
                    f'<p:tav tm="100000"><p:val><p:strVal val="#{attr}"/></p:val></p:tav></p:tavLst></p:anim>')
        body, preset, sub = vis + scale('ppt_w') + scale('ppt_h') + fade, 53, 16
    else:
        rise = (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{i()}" dur="600" fill="hold"/>'
                f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>'
                f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y+0.03"/></p:val></p:tav>'
                f'<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>')
        body, preset, sub = vis + fade + rise, 10, 0
    return (f'<p:par><p:cTn id="{i()}" presetID="{preset}" presetClass="entr" presetSubtype="{sub}" fill="hold" grpId="0" nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>{body}</p:childTnLst></p:cTn></p:par>')


def timing(shapes):
    counter = iter(range(5, 100000))
    pars, blds, delay, last_group = [], [], 0, None
    for spid, name, is_sp in shapes:
        group = re.sub(r'^anim\d+ ', '', name).split('-')[0]
        # elements of the same visual group (card + its text) arrive together-ish
        delay += 90 if group == last_group else 160
        last_group = group
        kind = 'zoom' if any(w in name for w in ZOOM_WORDS) else 'fade'
        pars.append(effect(counter, spid, delay, kind))
        if is_sp:
            blds.append(f'<p:bldP spid="{spid}" grpId="0"/>')
    if not pars:
        return ''
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            + ''.join(pars) +
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            '</p:childTnLst></p:cTn></p:par></p:tnLst>'
            + (f'<p:bldLst>{"".join(blds)}</p:bldLst>' if blds else '') + '</p:timing>')


def process(xml):
    shapes = []
    for m in re.finditer(r'<p:(sp|pic|graphicFrame)>.*?</p:\1>', xml, re.S):
        nv = re.search(r'<p:cNvPr id="(\d+)" name="([^"]*)"', m.group(0))
        if nv and nv.group(2).startswith('anim'):
            shapes.append((nv.group(1), nv.group(2), m.group(1) == 'sp' and '<p:txBody>' in m.group(0)))
    shapes.sort(key=lambda s: s[1])
    xml = re.sub(r'<p:transition.*?</p:transition>|<p:timing>.*?</p:timing>', '', xml, flags=re.S)
    return xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + TRANSITION + timing(shapes), 1), len(shapes)


def main(path):
    tmp = tempfile.mktemp(suffix='.pptx')
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.endswith('/'):
                continue  # drop folder entries (break some cloud viewers)
            data = zin.read(item.filename)
            if re.match(r'ppt/slides/slide\d+\.xml$', item.filename):
                xml, count = process(data.decode('utf-8'))
                if '</p:clrMapOvr>' not in data.decode('utf-8'):
                    raise SystemExit(f'{item.filename}: no clrMapOvr anchor')
                print(f'{item.filename}: {count} animated shapes')
                data = xml.encode('utf-8')
            zout.writestr(item, data)
    shutil.move(tmp, path)


if __name__ == '__main__':
    main(sys.argv[1])
