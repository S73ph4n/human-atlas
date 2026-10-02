/** Reader preferences, kept in the browser so a study session survives a reload: the interface language (unset follows
 *  the browser) and the radioanatomy quiz.
 *  Structure types are stored as the groups turned *off*: a study whose labels grow, or one opened for the first
 *  time, is quizzed in full rather than silently narrowed. Group ids are a study's own (brain regions) or body
 *  systems, the same ids the label panel switches. */
import {SLICE_AXES,type SliceAxis} from './anatomy';
import type {Locale} from './i18n';
export interface Settings {locale?:Locale;quizAxes:SliceAxis[];quizExcluded:string[];quizGenerated:boolean}
const ALL_AXES=SLICE_AXES.map(a=>a.id);
export const DEFAULT_SETTINGS:Settings={quizAxes:ALL_AXES,quizExcluded:[],quizGenerated:true};
const KEY='human-atlas:settings';
/** Stored settings, read defensively: an older or hand-edited value must not stop the app from starting. */
export function loadSettings():Settings{
 try{
  const raw=localStorage.getItem(KEY);if(!raw)return DEFAULT_SETTINGS;
  const stored=JSON.parse(raw) as Partial<Settings>;
  return {
   locale:stored.locale==='en'||stored.locale==='fr'?stored.locale:undefined,
   quizAxes:Array.isArray(stored.quizAxes)?ALL_AXES.filter(id=>stored.quizAxes!.includes(id)):DEFAULT_SETTINGS.quizAxes,
   quizExcluded:Array.isArray(stored.quizExcluded)?stored.quizExcluded.filter(id=>typeof id==='string'):[],
   quizGenerated:stored.quizGenerated!==false,
  };
 }catch{return DEFAULT_SETTINGS;}
}
/** Private browsing and full storage both throw here; the settings still work for this visit. */
export function saveSettings(settings:Settings){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{/* not stored */}}
