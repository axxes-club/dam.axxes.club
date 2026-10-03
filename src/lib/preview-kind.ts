export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'office' | 'text' | 'native' | 'unsupported';
export const officeExtensions = new Set(['doc','docx','odt','rtf','xls','xlsx','ods','csv','tsv','ppt','pptx','odp']);
export function previewKind(file: {name: string; originalFilename?: string | null; mimeType?: string | null}): PreviewKind {
 const extension=(file.originalFilename ?? file.name).split('.').pop()?.toLowerCase() ?? '';
 const mime=(file.mimeType ?? '').split(';')[0].toLowerCase();
 if(/^application\/vnd\.axxes\.office\.(doc|sheet|slides)$/.test(mime))return 'native';
 if(mime==='application/pdf'||extension==='pdf')return 'pdf';
 if(officeExtensions.has(extension)||/officedocument|msword|ms-excel|ms-powerpoint|opendocument|rtf/.test(mime))return 'office';
 if(mime.startsWith('image/')||['png','jpg','jpeg','gif','webp','avif','svg','bmp','heic','tiff'].includes(extension))return 'image';
 if(mime.startsWith('video/')||['mp4','mov','webm','m4v','ogv'].includes(extension))return 'video';
 if(mime.startsWith('audio/')||['mp3','wav','ogg','m4a','aac','flac'].includes(extension))return 'audio';
 if(mime.startsWith('text/')||['txt','md','json','xml','html','htm','js','ts','css','log','yaml','yml','py','sql'].includes(extension)||mime==='application/json'||mime==='application/xml')return 'text';
 return 'unsupported';
}
