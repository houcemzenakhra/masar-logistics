#!/bin/sh
# Packages the plugin for download from the merchant space: apps/web/public/downloads/masar-woocommerce.zip
set -e
cd "$(dirname "$0")"
mkdir -p ../../apps/web/public/downloads
rm -f ../../apps/web/public/downloads/masar-woocommerce.zip
python3 -c "
import zipfile, os
with zipfile.ZipFile('../../apps/web/public/downloads/masar-woocommerce.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk('masar-delivery'):
        for f in sorted(files):
            z.write(os.path.join(root, f))
"
echo "Built apps/web/public/downloads/masar-woocommerce.zip"
