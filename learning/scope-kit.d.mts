export const MAPS: {id:string;title:string;path:string}[];
export const BASE:string;
export function esc(value:unknown):string;
export function mountScope(config:{id:string;title:string;data:any;status:(id:string)=>number;openTopic:(id:string)=>void}):void;
export function freshScope(map:string):any;
export function validateScope(value:unknown,map:string,gaps:any[]):any;
export function download(value:unknown,name:string):void;
