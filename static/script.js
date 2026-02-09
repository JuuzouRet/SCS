{\rtf1}document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       GENEL AYARLAR & NAVİGASYON
       ========================================= */
    
    // Bloklanan Taglar (blocklist.js dosyasından gelir)
    const BLOCKLIST = window.DEFAULT_BLOCKLIST || ["real person", "pornstar", "onlyfans"];

    // Navigasyon (Tab Geçişleri)
    window.showPage = function(pageId) {
        // İçerikleri gizle/göster
        document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');

        // Buton stillerini güncelle
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        // Tıklanan butonu bulmak için event.target kullanımı global scope'da zor olabilir, 
        // bu yüzden HTML'de onclick'e (this) eklemek daha iyidir ama CSS ile idare edelim.
    };

    // Konsol Loglama Fonksiyonu
    function log(msg, type = 'info') {
        const consoleDiv = document.getElementById('consoleLog');
        const color = type === 'error' ? '#ff4444' : (type === 'success' ? '#00c851' : '#00ff00');
        consoleDiv.innerHTML += `<div style="color:${color}">> ${msg}</div>`;
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    /* =========================================
       BÖLÜM 1: CHUB.AI İNDİRİCİ (PYTHON PORTU)
       ========================================= */
    
    let isDownloading = false;
    let foundNodes = []; // İndirilecek karakter listesi
    const PACK_SIZE = 100; // API istek boyutu

    // 1.1 Etiket Analizi (tag_count.py mantığı)
    window.analyzeTag = async function() {
        const tag = document.getElementById('tagInput').value.trim();
        if (!tag) { alert("Lütfen bir etiket girin!"); return; }

        log(`'${tag}' etiketi analiz ediliyor...`);
        document.getElementById('statsBox').style.display = 'block';
        
        // API Parametreleri
        const params = new URLSearchParams({
            search: "", first: 1, topics: tag, page: 1, sort: "default", asc: "false",
            nsfw: "true", nsfl: "true", namespace: "*", include_forks: "true", exclude_mine: "false",
            min_tokens: 50, max_tokens: 100000, min_tags: 2, count: "true"
        });

        try {
            const response = await fetch(`https://gateway.chub.ai/search?${params}`);
            if (!response.ok) throw new Error("API Hatası");
            
            const data = await response.json();
            // Chub API bazen data.count bazen data.data.count döner
            const totalCount = data.data?.count || data.count || 0;

            document.getElementById('foundCount').innerText = totalCount;
            document.getElementById('estPages').innerText = Math.ceil(totalCount / PACK_SIZE);
            document.getElementById('downloadAllBtn').style.display = 'inline-block';
            
            log(`Analiz tamamlandı: ${totalCount} karakter bulundu.`, 'success');

        } catch (error) {
            log(`Hata oluştu: ${error.message}`, 'error');
            console.error(error);
        }
    };

    // 1.2 İndirme İşlemi (chub.py mantığı - ZIP olarak indirir)
    window.startWebDownload = async function() {
        if (isDownloading) return;
        isDownloading = true;
        const tag = document.getElementById('tagInput').value.trim();
        const zip = new JSZip(); // ZIP oluşturucu
        const totalCount = parseInt(document.getElementById('foundCount').innerText);
        let processed = 0;
        let page = 1;

        log("--- İNDİRME BAŞLATILIYOR (ZIP Modu) ---", 'success');

        try {
            while (processed < totalCount && isDownloading) {
                log(`Sayfa ${page} taranıyor...`);

                const params = new URLSearchParams({
                    first: PACK_SIZE, page: page, topics: tag, sort: "default", asc: "false",
                    nsfw: "true", nsfl: "true", namespace: "*", include_forks: "false", exclude_mine: "true",
                    min_tokens: 50, min_tags: 2
                });

                const response = await fetch(`https://gateway.chub.ai/search?${params}`);
                const json = await response.json();
                const nodes = json.data?.nodes || [];

                if (nodes.length === 0) break;

                // Her bir karakteri işle
                const promises = nodes.map(async (node) => {
                    // Bloklanan tag kontrolü
                    const nodeTags = (node.topics || []).map(t => t.toLowerCase());
                    const isBlocked = BLOCKLIST.some(bt => nodeTags.includes(bt.toLowerCase()));
                    
                    if (isBlocked) return null;

                    // Detaylı veri çek (Full Path ile)
                    try {
                        const detailRes = await fetch(`https://gateway.chub.ai/api/characters/${node.fullPath}?full=true`);
                        const detailData = await detailRes.json();
                        let charData = detailData.node || detailData;

                        // Resim URL Düzeltme
                        const imgUrl = charData.max_res_url || charData.avatar_url;
                        if (imgUrl) {
                            charData.avatar = imgUrl;
                            charData.image = imgUrl;
                            if (charData.definition) charData.definition.avatar = imgUrl;
                        }

                        // Dosya Adı Temizleme
                        let safeName = (charData.name || "unknown").replace(/[^a-z0-9]/gi, '_');
                        let fileName = `${safeName}_${charData.id || Date.now()}.json`;

                        // ZIP'e ekle
                        zip.file(fileName, JSON.stringify(charData, null, 4));
                        return fileName;

                    } catch (err) {
                        return null;
                    }
                });

                await Promise.all(promises);
                
                processed += nodes.length;
                log(`İlerleme: ${processed} / ${totalCount} işlendi.`);
                page++;
                
                // API'yi boğmamak için minik bekleme
                await new Promise(r => setTimeout(r, 500));
            }

            if (isDownloading) {
                log("ZIP dosyası oluşturuluyor, lütfen bekleyin...", 'success');
                const content = await zip.generateAsync({type:"blob"});
                
                // İndirme linki oluştur
                const a = document.createElement("a");
                a.href = URL.createObjectURL(content);
                a.download = `SCS_Arsiv_${tag}.zip`;
                a.click();
                
                log("İndirme Tamamlandı!", 'success');
            }

        } catch (error) {
            log(`İndirme Hatası: ${error.message}`, 'error');
        } finally {
            isDownloading = false;
        }
    };

    window.stopProcess = function() {
        isDownloading = false;
        log("İşlem kullanıcı tarafından durduruldu.", 'error');
    };


    /* =========================================
       BÖLÜM 2: ARŞİV GÖRÜNTÜLEYİCİ (ARCHIVE)
       ========================================= */
    
    const folderInput = document.getElementById('folderInput');
    const gallery = document.getElementById('gallery');
    const archiveSearch = document.getElementById('archiveSearch');
    let archiveData = [];

    // Klasör Yükleme
    if (folderInput) {
        folderInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files).filter(f => f.name.endsWith('.json'));
            if (files.length === 0) return;

            gallery.innerHTML = '<div style="color:white">Yükleniyor...</div>';
            archiveData = [];

            for (let file of files) {
                try {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    // Dizi mi Tekil mi kontrolü
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(item => archiveData.push(item));
                } catch (err) { console.error(err); }
            }

            renderGallery(archiveData);
            document.getElementById('archiveStatus').innerText = `${archiveData.length} Karakter Yüklendi.`;
        });
    }

    // Galeri Render
    function renderGallery(list) {
        gallery.innerHTML = '';
        const fragment = document.createDocumentFragment();

        // Performans için ilk 100 öğeyi gösterelim (Pagination eklenebilir)
        const limitList = list.slice(0, 100); 

        limitList.forEach(data => {
            const div = document.createElement('div');
            div.className = 'card';
            
            let imgSrc = data.avatar || data.image || (data.definition && data.definition.avatar) || 'https://via.placeholder.com/300x400';
            
            div.innerHTML = `
                <img src="${imgSrc}" loading="lazy">
                <div class="card-content">
                    <div class="card-name">${data.name || 'İsimsiz'}</div>
                </div>
            `;
            div.onclick = () => openModal(data, imgSrc);
            fragment.appendChild(div);
        });
        gallery.appendChild(fragment);
    }

    // Arama
    if (archiveSearch) {
        archiveSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = archiveData.filter(c => (c.name || "").toLowerCase().includes(term));
            renderGallery(filtered);
        });
    }

    // Modal İşlemleri
    const modal = document.getElementById('charModal');
    window.openModal = function(data, imgSrc) {
        document.getElementById('mImage').src = imgSrc;
        document.getElementById('mName').innerText = data.name;
        
        let desc = data.description || (data.definition ? data.definition.personality : "") || "Açıklama yok.";
        document.getElementById('mDesc').innerText = desc;
        
        // JSON İndirme Butonu
        const btn = document.getElementById('downloadJsonBtn');
        btn.onclick = () => {
            const blob = new Blob([JSON.stringify(data, null, 4)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${data.name.replace(/\W/g,'_')}.json`;
            a.click();
        };

        modal.style.display = 'flex';
    };

    window.closeModal = function() {
        modal.style.display = 'none';
    };


    /* =========================================
       BÖLÜM 3: DÖNÜŞTÜRÜCÜ (CONVERTER)
       ========================================= */
    
    const dropZone = document.getElementById('dropZoneConv');
    const convInput = document.getElementById('convInput');
    let convertedZip = null;

    if (dropZone) {
        dropZone.addEventListener('click', () => convInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#03dac6'; });
        dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = '#555');
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#555';
            handleConversion(e.dataTransfer.files);
        });
        convInput.addEventListener('change', (e) => handleConversion(e.target.files));
    }

    async function handleConversion(files) {
        if (files.length === 0) return;
        
        const statusDiv = document.getElementById('convStatus');
        statusDiv.innerText = "Dönüştürülüyor...";
        
        convertedZip = new JSZip();
        let count = 0;

        for (let file of files) {
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                let perchanceData;

                // V2 mi Tavern mi kontrol et
                if (json.spec === 'chara_card_v2') {
                    perchanceData = convertToPerchance(json.data); // V2
                } else if (json.definition || json.name) {
                    // Tavern/Janitor Normalize
                    const normalized = {
                        name: json.name || (json.definition ? json.definition.name : "Unknown"),
                        description: json.description || (json.definition ? json.definition.personality : ""),
                        first_mes: json.first_mes || (json.definition ? json.definition.first_message : ""),
                        avatar: json.avatar || (json.definition ? json.definition.avatar : "")
                    };
                    perchanceData = convertToPerchance(normalized);
                }

                if (perchanceData) {
                    convertedZip.file(file.name.replace('.json', '_perchance.json'), JSON.stringify(perchanceData, null, 2));
                    count++;
                }
            } catch (err) { console.error("Convert Error:", err); }
        }

        statusDiv.innerText = `${count} dosya başarıyla dönüştürüldü!`;
        const dlBtn = document.getElementById('downloadConvBtn');
        dlBtn.style.display = 'inline-block';
        
        dlBtn.onclick = async () => {
            const content = await convertedZip.generateAsync({type:"blob"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(content);
            a.download = "Converted_Characters.zip";
            a.click();
        };
    }

    // Perchance Formatına Çeviren Yardımcı Fonksiyon
    function convertToPerchance(charData) {
        const id = Date.now();
        const initialMessages = charData.first_mes ? [{ author: 'ai', content: charData.first_mes }] : [];

        const characterRow = {
            id: id,
            name: charData.name,
            roleInstruction: charData.description || "",
            avatar: { url: charData.avatar || "", size: 5, shape: "portrait" },
            modelName: "perchance-ai",
            initialMessages: initialMessages,
            // Diğer zorunlu Dexie alanları (Varsayılan değerlerle)
            maxParagraphCountPerMessage: 0, reminderMessage: "", generalWritingInstructions: "", 
            temperature: 0.8, creationTime: id, lastMessageTime: id
        };

        const threadRow = {
            id: id, name: `Chat: ${charData.name}`, characterId: id,
            creationTime: id, lastMessageTime: id
        };

        return {
            formatName: "dexie", formatVersion: 1,
            data: {
                databaseName: "chatbot-ui-v1", databaseVersion: 90,
                tables: [
                    { name: "characters", schema: "++id,modelName", rowCount: 1 },
                    { name: "threads", schema: "++id,name,characterId", rowCount: 1 }
                ],
                data: [
                    { tableName: "characters", inbound: true, rows: [characterRow] },
                    { tableName: "threads", inbound: true, rows: [threadRow] }
                ]
            }
        };
    }

    // Modal Dışına Tıklayınca Kapanma
    window.onclick = function(event) {
        if (event.target == document.getElementById('charModal')) {
            window.closeModal();
        }
    };
});