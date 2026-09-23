from pathlib import Path
path = Path('/home/ubuntu/aleppo-center-cash/client/src/pages/Home.tsx')
text = path.read_text()
text = text.replace('</button></div></div><div className="currency-summary-grid">', '</button></div><div className="currency-summary-grid">', 1)
path.write_text(text)
