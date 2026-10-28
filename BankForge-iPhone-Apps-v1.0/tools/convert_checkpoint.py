"""Offline .pt <-> portable JSON conversion. Only load your own trusted files."""
import argparse,hashlib,json,sys
from pathlib import Path

def convert(source,destination=None):
    import torch
    source=Path(source)
    if source.suffix.lower()=='.pt':
        data=torch.load(source,map_location='cpu',weights_only=True)
        if not isinstance(data,dict) or 'spec' not in data or 'state' not in data:raise ValueError('Choose a modern BankForge checkpoint, such as best.pt or latest.pt')
        for value in data['state'].values():
            if not torch.isfinite(value).all():raise ValueError('Checkpoint contains non-finite weights')
        result=dict(format='bankforge-portable-1',name=source.parent.name+' / '+source.stem,
                    spec=data['spec'],weights={key:value.detach().cpu().tolist() for key,value in data['state'].items()},
                    action_sampling=data.get('action_sampling','greedy-v1'),updates=data.get('updates',0),games=data.get('games',0),
                    source_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
        target=Path(destination) if destination else source.with_name(source.stem+'-portable.json')
        if target.resolve()==source.resolve():raise ValueError('Choose a different output file')
        target.write_text(json.dumps(result,separators=(',',':'),allow_nan=False),encoding='utf8')
    else:
        data=json.loads(source.read_text(encoding='utf8'));phone=data.get('format')=='bankforge-phone-run-1'
        portable=data['model'] if phone else data
        if 'spec' not in portable or 'weights' not in portable:raise ValueError('Choose a BankForge portable model JSON or phone-run backup')
        state={key:torch.tensor(value,dtype=torch.float32) for key,value in portable['weights'].items()}
        if any(not torch.isfinite(v).all() for v in state.values()):raise ValueError('Model contains non-finite weights')
        spec=portable['spec'];schemas={'bankforge-mlp-gae-1':'mlp','bankforge-position-mlp-1':'position-mlp','bankforge-opponent-attention-1':'attention','bankforge-position-attention-1':'position-attention','bankforge-position-attention-2':'position-attention-power','bankforge-position-attention-3':'position-attention-cdf','bankforge-set-transformer-1':'set-state','bankforge-set-memory-1':'set-memory','bankforge-attention-memory-1':'attention-memory','bankforge-set-prediction-1':'set-predict'}
        if spec['schema'] not in schemas:raise ValueError('Unknown network schema')
        config=dict(architecture=schemas[spec['schema']],width=spec['width'],depth=spec['depth'],feedback_mode='win',feedback_progress=.25,terminal_win_rule='split',training_objective='sole_wins',placement_mix=0.,scoring_rule='positive-split-zero-loss-v1')
        if phone:
            c=data['config'];config.update(feedback_mode='potential' if c.get('potential') else 'win',feedback_progress=c.get('potentialStrength',.25),training_objective=c.get('objective','sole_wins'),gamma=c.get('gamma',1.),gae_lambda=c.get('lambda',.95))
        result=dict(spec=spec,state=state,config=config,optimizer=None,updates=portable.get('updates',0),games=portable.get('games',0),
                    action_sampling=portable.get('action_sampling','greedy-v1'),rng_cpu=torch.get_rng_state(),rng_cuda=[],
                    import_note='Imported portable weights. The PC optimizer starts fresh; use the phone-run JSON to resume the phone optimizer.')
        target=Path(destination) if destination else source.with_name(source.stem+'-converted.pt')
        if target.resolve()==source.resolve():raise ValueError('Choose a different output file')
        torch.save(result,target)
    return target

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',nargs='?');parser.add_argument('destination',nargs='?');args=parser.parse_args()
    if not args.source:
        import tkinter as tk
        from tkinter import filedialog,messagebox
        window=tk.Tk();window.withdraw();path=filedialog.askopenfilename(title='Choose a BankForge checkpoint or portable model',filetypes=[('BankForge models','*.pt *.json')])
        if not path:return
        try:target=convert(path);messagebox.showinfo('BankForge conversion complete','Saved:\n'+str(target))
        except Exception as e:messagebox.showerror('Could not convert',str(e));raise
    else:print(convert(args.source,args.destination))

if __name__=='__main__':main()
