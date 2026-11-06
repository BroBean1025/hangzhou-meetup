// Binary min-heap; the comparator also supplies deterministic tie ordering.
export class MinHeap{
 constructor(before){this.items=[];this.before=before;}
 get size(){return this.items.length;}
 push(value){const a=this.items;let i=a.length;a.push(value);while(i){const p=(i-1)>>1;if(!this.before(value,a[p]))break;a[i]=a[p];i=p;}a[i]=value;}
 pop(){const a=this.items,first=a[0],last=a.pop();if(!a.length)return first;let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.before(a[c+1],a[c]))c++;if(!this.before(a[c],last))break;a[i]=a[c];i=c;}a[i]=last;return first;}
}
