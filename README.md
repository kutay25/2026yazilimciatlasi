# YAZILIM SEKTORU MAASLARI | 2026

Bu repo artık yalnızca ham anket dökümünü değil, aynı zamanda onun üzerine kurulmuş interaktif bir analiz artefaktını da içerir.

## Ne var?

- `2026-yazilim-sektoru-maaslari-onceki-yazilimci.json`
  Ham kişi bazlı anket verisi.
- `public/data/survey-processed.json`
  Temizlenmiş, türetilmiş alanlarla zenginleştirilmiş analiz verisi.
- `public/data/analysis-summary.json`
  Özet istatistikler, temel bulgular ve sorgu önerileri.
- `public/data/turkey-provinces.geojson`
  Turkiye il sınırları katmanı.
- `src/`
  Tek sayfalık tablı atlas uygulaması.

## Uygulama sekmeleri

- `Panorama`
  Genel ücret dağılımı, deneyim eğrisi, rol ailesi x seviye ısı haritası.
- `Atlas`
  Turkiye illeri üzerinde interaktif ücret / hacim haritası.
- `Desenler`
  Rol, sektör, çalışma düzeni ve teknoloji kırılımları.
- `Sorgu Lab`
  Hafif sorgu dili ile canlı kesit üretme alanı.
- `Metod`
  Temizleme varsayımları ve veri okuma notları.

## Calistirma

```bash
npm install
npm run dev
```

Prod build:

```bash
npm run build
npm run preview
```

## Mini sorgu dili

Sorgular boru hattı gibi çalışır:

```text
filter currency=TRY & seniority=Senior | group roleFamily, workMode | metric median(salary), count() | sort -median_salary | min_count 15
```

Desteklenen parçalar:

- `filter field=value`
- `filter field!=value`
- `filter field~value`
- `filter field in (A, B, C)`
- `group field, field`
- `metric count()`
- `metric median(salary), mean(salary), p25(salary), p75(salary), min(salary), max(salary)`
- `metric share(hasAiTools)`
- `sort -metric_name`
- `limit N`
- `min_count N`

## Kaynak

Anket [Önceki Yazılımcı](https://x.com/oncekiyazilimci) tarafından düzenlenmiştir.

- https://x.com/oncekiyazilimci
- https://www.linkedin.com/in/oncekiyazilimci/
