# Iniciar o túnel principal e salvar o log
cloudflared tunnel run --credentials-file /home/kali/.cloudflared/ebd34ec1-feb7-4c06-93b0-5cf89fe6efae.json neurelix-tunel \
  > /home/kali/logs/neurelix_tunel.log 2>&1 &

# Iniciar o túnel esp_server e salvar o log
cloudflared tunnel --config /home/kali/.cloudflared/esp_server/config.yml run \
  > /home/kali/logs/esp_server_tunel.log 2>&1 &
