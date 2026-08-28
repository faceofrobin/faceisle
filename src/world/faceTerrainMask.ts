/**
 * Signed-distance field derived from /public/assets/the-face/terrain-mask.svg.
 *
 * Positive samples are land; negative samples are water. The field is stored
 * at quarter-pixel precision in a compact byte grid. It is a runtime
 * derivative only: the SVG remains the authoritative geometry.
 */
export const FACE_MASK_SIZE = 128;

const QUARTERS_PER_PIXEL = 4;
const NORMALIZED_PIXEL = 2 / FACE_MASK_SIZE;

const ENCODED =
  "FxkcHyIlJyotMDM2ODs9P0JERkhKTE9RU1VXWlxeYGJkZWdpamtsbnBycnR1dnZ3eXp6enx+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fHp6enl3dnZ1dHJycG5s" +
  "a2ppZ2VkYmBeXFpXVVNRT0xKSEZEQj89Ozg2MzAtKiclIh8cGRcZHB8iJScqLTAzNjg7PkBDRUdJTE5QUlRXWVtdYGJkZWdpa2xubnBydHV2d3l6enp8fn5+" +
  "foKCgoKCgoKCgoKCgoKCgoKCgoKCgoJ+fn5+fHp6enl3dnV0cnBubmxraWdlZGJgXVtZV1RSUE5MSUdFQ0A+Ozg2MzAtKiclIh8cGRwfIiUnKi0wMzY4Oz5B" +
  "REZISkxPUVNVV1pcXmBjZWdpa2xucHJydHV3eXp6fH5+fn6CgoKChIaGhoaGhoaGhoaGhoaGhoaGhoaGhIKCgoJ+fn5+fHp6eXd1dHJycG5sa2lnZWNgXlxa" +
  "V1VTUU9MSkhGREE+Ozg2MzAtKiclIh8cHyIlJyotMDM2ODs+QURHSUxOUFJUV1lbXWBiZGZoa2xucHJ0dXZ3eXp8fn5+goKCgoSGhoaHiYqKioqKioqKioqK" +
  "ioqKioqKiomHhoaGhIKCgoJ+fn58enl3dnV0cnBubGtoZmRiYF1bWVdUUlBOTElHREE+Ozg2MzAtKiclIh8iJScqLTAzNjg7PkFER0lMT1FTVVdaXF5gY2Vn" +
  "aWtucHJ0dXd5enp8fn6CgoKEhoaGh4mKiomHhoaGhoaGhoaGhoaGhoaGhoaGh4mKiomHhoaGhIKCgn5+fHp6eXd1dHJwbmtpZ2VjYF5cWldVU1FPTElHREE+" +
  "Ozg2MzAtKiclIiUnKi0wMzY4Oz5BREdJTE9SVFdZW11gYmRmaGtsbnF0dXd5enx+fn6CgoSGhoeJiomHhoaGhoSCgoKCgoKCgoKCgoKCgoKCgoKEhoaGhoeJ" +
  "iomHhoaEgoJ+fn58enl3dXRxbmxraGZkYmBdW1lXVFJPTElHREE+Ozg2MzAtKiclJyotMDM2ODs+QURHSUxPUlVXWlxeYGNlZ2lrbnBydHd5enx+foKCgoSG" +
  "h4mJh4aGhoSCgoKCgn5+fn5+fn5+fn5+fn5+fn5+foKCgoKChIaGhoeJiYeGhIKCgn5+fHp5d3RycG5raWdlY2BeXFpXVVJPTElHREE+Ozg2MzAtKicqLTAz" +
  "Njg7PkFER0lMT1JVV1pdYGJkZmhrbG5xdHV3eXx+foKChIaGh4mJh4aEgoKCgn5+fn5+fHp6enp6enp6enp6enp6enp8fn5+fn6CgoKChIaHiYmHhoaEgoJ+" +
  "fnx5d3V0cW5sa2hmZGJgXVpXVVJPTElHREE+Ozg2MzAtKi0wMzY4Oz5BREdJTE9SVVdaXWBjZWdpa25wcnR3eXp8foKChIaHiYmHhoaEgoJ+fn5+fHp6enp5" +
  "d3Z2dnZ2dnZ2dnZ2dnZ2d3l6enp6fH5+fn6CgoSGhoeJiYeGhIKCfnx6eXd0cnBua2lnZWNgXVpXVVJPTElHREE+Ozg2MzAtMDM2ODs+QURHSUxPUlVXWl1g" +
  "Y2Zoa2xucXR1d3l8fn6ChIaHiYmHhoSCgoJ+fnx6enp5d3Z2dnV0cnJycnJycnJycnJycnJ0dXZ2dnd5enp6fH5+goKChIaHiYmHhoSCfn58eXd1dHFubGto" +
  "ZmNgXVpXVVJPTElHREE+Ozg2MzAzNjg7PkFER0lMT1JVV1pdYGNmaGtucHJ0d3l6fH6CgoSHiYmHhoSCgn5+fnx6eXd2dnV0cnJycnBubm5ubm5ubm5ubm5u" +
  "bnBycnJydHV2dnd5enx+fn6CgoSGh4mJh4SCgn58enl3dHJwbmtoZmNgXVpXVVJPTElHREE+Ozg2MzY4Oz5BREdJTE9SVVdaXWBjZmhrbnF0dXd5fH5+goSG" +
  "h4mHhoSCgn5+fHp6eXd1dHJycnBubm5ubGtqampqampqampqamprbG5xdHV2dnZ2dnZ3eXp6fH5+goKEhoeJh4aEgn5+fHl3dXRxbmtoZmNgXVpXVVJPTElH" +
  "REE+Ozg2ODs+QURHSUxPUlVXWl1gY2Zoa25xdHd5enx+goKEh4mHhoSCgn5+fHp5d3Z1dHJwbm5ubGtqampqampqamlnZmZmZmZmZ2tucXR3eXp6enp6enp6" +
  "eXd5enx+foKChIaHiYeEgoJ+fHp5d3RxbmtoZmNgXVpXVVJPTElHREE+Ozg7PkFER0lMT1JVV1pdYGNmaGtucXR3eXx+foKEhoeJh4SCgn5+fHp5d3V0cnJw" +
  "bmxramppaWtsbm5ubm5ubGtqampqamprbHB0d3l8fn5+fn5+fn58enp6eXp8fn6CgoSHiYeGhIJ+fnx5d3RxbmtoZmNgXVpXVVJPTElHREE+Oz1AREdJTE9S" +
  "VVdaXWBjZmhrbnF0d3l8foKChIeJh4aEgn5+fHp5d3V0cnBubmxraWdmaGtsbnBycnJycnJwbm5ubm5ubm5wcnV5fH6CgoKCgoKCgn5+fn58enl6fH5+goSG" +
  "h4mHhIKCfnx5d3RxbmtoZmNgXVpXVVJPTElHREA9P0NGSUxPUlVXWl1gY2Zoa25xdHd5fH6ChIaHiYeEgoJ+fHp5d3V0cnJycG5raWdlZ2lrbnBydHV2dnZ2" +
  "dXRycnJycnJycnR1d3p+goSGhoaGhoaEgoKCgn5+fHl5enx+goKEh4mHhoSCfnx5d3RxbmtoZmNgXVpXVVJPTElGQz9CRUhMT1JVV1pdYGNmaGtucXR3eXx+" +
  "goSHiYmHhIJ+fnx5enp5d3Z2dnV0cW5raGhrbG5xdHV3eXp6enp5d3Z2dnZ2dnZ2d3l6fH6ChomKioeEgoKCgoKCgoJ+enZ3eXx+foKEh4mJh4SCfnx5d3Rx" +
  "bmtoZmNgXVpXVVJPTEhFQkRHSk5RVFdaXWBjZmhrbnF0d3l8foKEh4mHhoSCfnx6enx+fnx6enp6eXd0cW5ra25wcnR3eXp8fn5+fnx6enp6enp6enp6fH5+" +
  "goSHi46KhoJ+fn5+fn5+fnx5dXR3eXp8foKEhoeJh4SCfnx5d3RxbmtoZmNgXVpXVFFOSkdERklMUFNXWl1gY2Zoa25xdHd5fH6ChIeJh4SCgn58eXx+foKC" +
  "fn5+fn58eXd0cW5ucXR1d3l8fn6CgoKCfn5+fn5+fn5+fn5+goKEh4mMjouHhIJ+fnx6enp6eXd0cXR1d3l8foKChIeJh4SCfnx5d3RxbmtoZmNgXVpXU1BM" +
  "SUZITE9SVVlcYGNmaGtucXR3eXx+goSHiYeEgn5+fHl8foKChISCgoKCgn58eXd0cHJ0d3l6fH6CgoSGhoSCgoKCgoKCgoKCgoKEhoeJjI+QjImHhIKCfn58" +
  "enp5d3RxcHJ0d3l8fn6ChIeJh4SCfnx5d3RxbmtoZmNgXFlVUk9MSEpOUVRXW15iZWhrbnF0d3l8foKEh4mHhIJ+fHp5fH6ChIaHh4aGhoaEgn58eXV0dXd5" +
  "fH5+goSGh4mJh4aGhoaGhoaGhoaGhoeJi4yPkpKPjImHhoSCgn5+fnx5d3RwbnF0d3l6fH6ChIeJh4SCfnx5d3RxbmtoZWJeW1dUUU5KTFBTV1pdYGRna25x" +
  "dHd5fH6ChIeJh4SCfnx5eXx+goSHiYuLioqKiYeEgn56eXd5enx+goKEh4mLjIyLioqKioqKioqKioqKi4yOkJKVlZKPjIuJh4aEgoKCfnx5dXJubnF0dXd5" +
  "fH6ChIeJh4SCfnx5d3RxbmtnZGBdWldTUExPUlVZXGBjZmlscHR3eXx+goSHiYeEgn58eXd6foKEh4mMjo6Ojo6MiYaCfn58enx+foKEhoeJjI6QkI6Ojo6O" +
  "jo6Ojo6Ojo6OkJKUlZiYlZKOi4eEgoKCgoKCfnp2cm5rbnBydHd5fH6ChIeJh4SCfnx5d3RwbGlmY2BcWVVST1FUV1teYmVoa25ydXl8foKEh4mHhIJ+fHl3" +
  "eXx+goaJjI+SkpKSko6Lh4SCgn5+foKChIeJi4yPkpSUkpKSkpKSkpKSkpKSkpKUlZeZm5qWko6KhoJ+fn5+fn58eXVybmtrbG5xdHd5fH6ChIeJh4SCfnx5" +
  "dXJua2hlYl5bV1RRU1daXWBkZ2tucXR3en6ChIeJh4SCfnx5d3Z6foKEh4uOkpWWlpaUkIyJh4aEgoKChIaHiYyOkJKVl5eWlpaWlpaWlpaWlpaWlpeZm5ye" +
  "mpaSjouHhIJ+fnx6enp5d3Rxbmtpa25xdHd5fH6ChIeJh4SCfnp3dHFua2dkYF1aV1NVWVxgY2ZpbHB0d3l8foKGiYeEgn58eXd0dnp+goaJjJCUl5qamZWS" +
  "j4yLiYeGhoaHiYuMj5KUlZiam5qampqampqampqampqam5yeoJ+bl5SQjImHhIKCfn5+fnx5d3Rxbmtoa25xdHd5fH6ChIeJhoJ+fHl3dHBsaWZjYFxZVVdb" +
  "XmJlaGtucnV5fH6ChIeJhoJ+fHl3dHJ2en6ChoqOkpWZnJ6bmJWSkI6Mi4qKiouMjpCSlZeZm52fnp6enp6enp6enp6enp6foKKkoJyZlZKPjImHhoSCgoKC" +
  "fnx5d3RwbGloa25xdHd5fH6ChomHhIJ+fHl1cm5raGViXltXWl1gZGdrbnF0d3p+goSHiYeEgn56d3RxdHd6foKGio6SlpqeoJ2amJWUkpCOjo6OjpCSlJWY" +
  "mpyeoKOioqKioqKioqKioqKioqOkpaWinpuYlZKPjIuJh4aGhoSCfnx5dXJuamZoa25xdHd6foKEh4mHhIJ+end0cW5rZ2RgXVpcYGNmaWxwdHd5fH6ChomH" +
  "hIJ+fHl1cnJ1eXx+goaKjpKWmp6ioJ2bmZeVlJKSkpKSlJWXmZudoKKkpqampqampqampqampqamp6WkoqCenJqYlZKQjoyLioqJh4SCfnp2cm5qZmZoa25y" +
  "dXl8foKEh4mGgn58eXd0cGxpZmNgXF5iZWhrbnJ1eXx+goSHh4SCfnx5d3RwcnZ6foKEh4uOkpaanqKjoJ6cm5mXlpaWlpaXmZucnqCjpaepqqqqqqqqqqqq" +
  "qqqqqaakoqCenJuZl5WUkpKQjoyLiYeGhIJ+enZybmpmY2ZpbHB0d3l8foKEh4eEgn58eXVybmtoZWJeYGRna25xdHd6foKEh4mGgn58eXd0cW5ydnp+goaJ" +
  "jJCUl5ufo6akoqCenJuampqampucnqCipKapq62urq6urq6urq6uq6mmo6CenJuZl5WUkpCOjoyLiYeGhIKCfnx5dXJuamZiZGdrbnF0d3l8foKGiYeEgn56" +
  "d3RxbmtnZGBiZWlscHR3eXx+goaJh4SCfnp3dHFubnJ2en6ChoqOkpWZnKCkqKelpKKgn56enp6en6CipKWnqayusLKysrKysrKxrquppqOgnZuZl5WUkpCO" +
  "jIuKiYeGhIKCfn58eXd0cGxpZWFiZWhrbnF0d3p+goSHiYaCfnx5d3RwbGllYmRna25ydXl8foKEh4eEgn58eXVybmxwdHd6foKGio6SlpqeoqWpqqmnpaSj" +
  "oqKioqKjpKWnqausra6wsrS2tra0sa6rqaajoJ2amJWUkpCOjIuJh4aGhIKCfn58enl3dHFua2dkYGBjZmhrbnJ1eXx+goSHh4SCfnx5dXJua2dkZWlscHR3" +
  "en6ChIeJhoJ+fHl3dHBsbnJ1eXx+goaKjpKWmp6ipqampqampqampqampqampqamp6ipq62vsbS3trKvrKmmo6CdmpiVkpCOjIuJh4aEgoKCfn58enl3dXRx" +
  "bmtoZWJeXWBjZmlscHR3eXx+goaJh4SCfnp3dHBsaWVna25ydXl8foKGiYeEgn56d3RxbmtucnZ6foKEh4uOkpaanqKioqKioqKioqKioqKioqKioqKjpKWn" +
  "qayusbS0sK2ppqOgnZqYlZKPjIuJh4aEgoJ+fn58enl3dXRycG5raWdlZGJgXWBkZ2tucXR3en6ChIeJhoJ+fHl1cm5rZ2lscHR3en6ChIeJhoJ+fHl1cm5r" +
  "am5ydnp+goaJjJCUl5uenp6enp6enp6enp6enp6enp6enp+goqSmqauusbGuq6ekoJ2amJWSj4yJh4aEgoJ+fnx6enl3dXRycG5ubm5sa2lnZWNgXmJlaGtu" +
  "cnV5fH6ChomHhIJ+end0cGxpam5ydXl8foKGiYeEgn56d3RwbGlrbnJ2en6ChoqOkpWZm5qampqampqampqampqampqampqam5yeoKOmqauurquppaKem5iV" +
  "ko+MiYeEgoJ+fnx6eXd2dXRycnJycnJycnBubGtoZmNgYGNmaWxwdHd6foKEh4mGgn58eXVybmprbnJ2en6ChIeJhoJ+fHl1cm5raWxwdHd6foKGio6SlpmX" +
  "lpaWlpaWlpaWlpaWlpaWlpaWlpaXmZudoKOmqaurqaajoJyZlZKPjImHhIJ+fnx6eXd1dHJ0dXZ2dnZ2dnZ1dHJwbmtoZWJeYGRna25ydXl8foKGiYeEgn56" +
  "dnJua2xwdHd6foKGiYeEgn56d3RwbGlqbnJ1eXx+goaKjpKWlZSSkpKSkpKSkpKSkpKSkpKSkpKSkpSVmJqdoKOmqammo6Cdm5eUkIyJh4SCfnx6eXd1dHJw" +
  "dHd5enp6enp6enl3dXRxbmtnZGBeYmVpbHB0d3p+goSHiYaCfnp3dHBsbnJ1eXx+goaJhoJ+fHl1cm5rZ2pucnZ6foKEh4uOkpSSkI6Ojo6Ojo6Ojo6Ojo6O" +
  "jo6Ojo6OkJKVmJqdoKOmpqOgnZqYlZKOi4eEgn58eXd1dHJwbnJ1eXx+fn5+fn5+fHp5d3RwbGllYl5gZGdrbnJ1eXx+goaJhoJ+fHl1cm5wdHd6foKEh4eE" +
  "gn56d3RwbGlna25ydnp+goaJjJCSkI6Mi4qKioqKioqKioqKioqKioqKiouMj5KVmJqdoKOkoJ2amJWSkI6KhoJ+fHl3dHJwbmxucnZ6foKCgoKCgoJ+fnx5" +
  "dXJua2dkYF5iZWlscHR3en6ChIeHhIJ+end0cHJ1eXx+goaJhoJ+fHl1cm5rZ2lscHR3en6ChoqOkI6Mi4mHhoaGhoaGhoaGhoaGhoaGhoaGh4mMj5KVmJqd" +
  "oKKem5iVko+Mi4mGgn56d3Rxbm5ubm5ydXl8fn5+goSGhIKCfnp3dHBsaWZjYGBkZ2tucnV5fH6ChomGgn58eXVycnZ6foKEh4mGgn56d3RwbGlmam5ydXl8" +
  "foKGio6Mi4mHhoSCgoKCgoKCgoKCgoKCgoKCgoKEh4mMj5KVmJqdoJyZlZKPjImHhoSCfnp2cnJycnJycHB0d3l6enx+goSHhoJ+fHl1cm5raGZjYGJlaWxw" +
  "dHd6foKGiYeEgn56dnJ0d3p+goaJh4SCfnp2cm5rZ2ZqbnJ2en6ChIeLjImHhoSCgn5+fn5+fn5+fn5+fn5+fn5+foKEh4mMj5KVmJqdmpeUkIyJh4SCgn58" +
  "eXZ2dnZ2dnV0cnJ0dXZ3eXx+goaHhIJ+end0cW5raGViYGRna25ydnp+goSHiYaCfnp3dHV5fH6ChomGgn58eXVybmpmZmpucnZ6foKGiYyJh4SCgn5+fHp6" +
  "enp6enp6enp6enp6enp8foKEh4mMj5KVmJuYlZKOi4eEgn5+fHl5enp6enp6eXd2dnV0cnR3en6ChomGgn58eXd0cW5rZ2RgYmZqbnJ1eXx+goaJhoJ+fHl1" +
  "dnp+goSHh4SCfnp3dHBsaWVna25ydnp+goaKi4eEgn5+fHp5d3l6enp6enp6enp6eXd2d3l8foKEh4mMj5KVmZWSj4yJhoJ+fHp5enx+fn5+fn58eXp6eXd1" +
  "dHZ6foKEhoeEgn58eXd0cGxpZmNhZWlscHR3en6ChIeHhIJ+enZ2en6ChomGgn58eXVybmtnZWlscHR3en6ChoqKhoJ+fHp5eXp6fH5+fn5+fn5+fn58eXV0" +
  "d3l8foKEh4mMkJSWlJCMiYeEgn56eXx+foKCgoKCgn58fn58enl3dXl8foKChIeEgn58eXVybmtoZmNkZ2tucnV5fH6ChomGgn56dnd6foKGioaCfnp3dHBs" +
  "aWVmam5ydXl8foKGioqGgn58eXp8fn5+goKCgoKCgoKCgn56dnR0d3l8foKEh4uOkpKSjouHhIJ+fHl6foKCfn5+fn5+fH6Cgn5+fHl3eXx+fn6ChIeEgn56" +
  "d3RxbmtoZWJlaWxwdHd6foKGioaCfnp3eXx+goaJhoJ+enZybmtnZGZqbnJ2en6ChIeLiYeEgn58fn6CgoKCgoKCgn5+fn5+fHp5d3R0d3l8foKGio6Ojo6O" +
  "ioaCfnx5d3l8fn5+goJ+enp6foKEgoJ+fHl6foKCfn6ChIaCfnx5d3RxbmtnZGRna25ydnp+goaJhoJ+fHl6foKEh4eEgn56dnJuamZiZmpucnZ6foKGiYmH" +
  "hIJ+fn6CgoJ+fn5+fn5+fHp6enp8fnx5d3R1eXx+goaKioqKioqJhoJ+end0d3l8foKEgn56dnl8foKGhIJ+fHp+goSCfn6ChoSCfnx5d3RwbGllYmZqbnJ2" +
  "en6ChIeHhIJ+enp+goaJhoJ+fHl1cm5qZmJmam5ydnp+goaKh4SCfn6Cgn5+fnx6enp8fn58eXZ2en6Cfnx5d3Z6foKEhoaGhoaGhoaEgn56dnJ2en6ChIaC" +
  "fnp3eXx+goaHhIJ+fHx+goSCfoKEhoSCfnx5dXJuamZiZmpucnV5fH6ChomGgn56en6ChoqGgn56d3RwbGllZGdrbnJ2en6ChoqGgn5+goSEgoJ+enl8fn6C" +
  "gn56dnd6foKCfnx5dXl8foKCgoKCgoKCgoJ+fHl1cnZ6foKEhoJ+fHp8foKEh4eGhIJ+enx+goJ+foKCgoKCfnp2cm5qZmJlaWxwdHd6foKGioaCfnp8foKG" +
  "ioaCfnp2cm5rZ2RlaWxwdHd6foKGhoaCfn6ChoaCfnx5en6CgoSCfnp3eXx+goSCfnp2d3l8fn5+fn5+fn5+fnx5d3RydXl8foKEhIJ+fn6ChIeGhIKCfnx5" +
  "eXx+gn58fn5+foJ+enZybmtnZGRna25ydnp+goaKhoJ+en6ChIeJhoJ+enZybmpmYmZqbnJ1eXx+goKCgoJ+goSHhoJ+end6foKGhoJ+fHp8foKEhoJ+enZ0" +
  "d3l6fH5+fn5+fn5+fHl1cnB0d3l8foKChIKCgoSGhIKCfn58enp8fn6Cgn6Cfn5+fnx5d3RwbGllYmZqbnJ2en6ChomGgn58foKGiYeEgn56dnJuamZiZmpu" +
  "cnZ6foKCfn5+fn6ChIeEgn56dnp+goSGhIJ+fn6ChIeGgn56dnZ2eXx+goKCgoKCgoJ+end0cHR3eXp8fn6CgoKCgoKCfn58fH5+fn6CgoJ+foKCgoKCfnx5" +
  "dXJua2dkZmpucnZ6foKEh4eEgn5+goaKhoJ+fHl1cm5qZmJmam5ydXl8foKCgoKCfn6ChIJ+fHp5eXx+goKEhIKCgoSHhIKCfnp6enp6foKEhoaGhoaGgn58" +
  "eXVydXl8fn5+fn5+fn5+fn5+fn5+goKCgoSEgn6ChIaGhoSCfnp3dHBsaWVmam5ydXl8foKGiYaCfn6ChoqGgn56d3RwbGllYmZqbnJ2en6ChIaGhoSCfn6C" +
  "gn5+fnx6enx+foKEhoaGh4SCfn58fH5+fnx+goaJioqKioeEgn56d3V2en6CgoKCfn5+fn6CgoKCgoKEhoaGhIJ+foKGiYqJhoJ+fHl1cm5qZmVpbHB0d3p+" +
  "goaKhoJ+foKGioaCfnp2cm5rZ2RiZmpucnZ6foKGiYqJh4SCfn6CgoKCfn5+fn5+foKGhoaGgn5+fn5+goKCfoKEh4uOjo6MiYaCfnx5eXp6foKGhoSCgoKC" +
  "goSGhoaGhoaGhIKCfn6ChIeLjouHhIJ+enZybmtnZGdrbnJ2en6ChoqGgn5+goaKhoJ+enZybmpmYmJmam5ydnp+goaKjoyJh4SCgn5+fn6CgoKCgoKCgoKC" +
  "goKCgoKCgoKCfn6ChIeJjJCSko6Lh4SCfnp8fn5+goKCgoKCgoKCgoKCgoKCgoKCfn5+goSHiYyQjImGgn56d3RwbGllZ2pucnZ6foKGioaCfn6ChoqGgn56" +
  "dnJuamZiYmZqbnJ2en6ChoqOj4yJh4aEgoKCfn5+fn5+fn5+fn5+fn5+fn5+foKCgoSHiYyPkpWUkIyJhoJ+fH6Cgn5+fn5+fn5+fn5+fn5+fn5+fn6CgoKE" +
  "h4mMj5KOioaCfnx5dXJuamhrbG5ydnp+goaKhoJ+foKGioaCfnp2cm5qZmJiZmpucnZ6foKGio6Sj4yLiYeGhoSCgoKCgoKCgoKCgoKCgoKCgoKChIaGh4mM" +
  "j5KVmJWSjouHhIJ+fH6CgoKCgoKCgoKCgoKCgoKCgoKCgoSGhoeJjI+Sko6Lh4SCfnp2cm5qa25wcnJ2en6ChoqGgn5+goaKhoJ+enZybmpmYmJmam5ydnp+" +
  "goaKjpKSkI6Mi4qJh4aGhoaGhoaGhoaGhoaGhoaGhoaHiYqLjI+SlZial5SQjImHhIJ+foKGhoaGhoaGhoaGhoaGhoaGhoaGh4mKi4yPkpWUkIyJhoJ+enZy" +
  "bmtucXR1dnZ6foKGioaCfn6ChoqGgn56dnJuamZiYmZqbnJ2en6ChoqOkpWUkpCOjoyLioqKioqKioqKioqKioqKioqKiouMjo6QkpWYmpyZlZKPjImHhIJ+" +
  "goaKioqKioqKioqKioqKioqKioqLjI6OkJKVmJWSjoqGgn56dnJubHB0d3l6eXp+goaKhoJ+foKGioaCfnp2cm5qZmZmZmpucnZ6foKGio6SlpeVlJKSkI6O" +
  "jo6Ojo6Ojo6Ojo6Ojo6Ojo6OjpCSkpSVmJqdnpuYlZKPjImHhIKEh4uOjo6Ojo6Ojo6Ojo6Ojo6Ojo6QkpKUlZialpKOioaCfnp2cm5ucnV5fH58en6ChoqG" +
  "gn5+goaKhoJ+enZybmpqamppam5ydnp+goaKjpKVmZmXlpWUkpKSkpKSkpKSkpKSkpKSkpKSkpKSlJWWl5mbnaCgnZqYlZKPjImHhoeJjJCSkpKSkpKSkpKS" +
  "kpKSkpKSkpSVlpeZm5qWko6KhoJ+enZybm5ydnp+gn56foKGioaCfn6ChoqGgn56dnJubG5ubmxrbnJ2en6ChomMkJSXm5uamZeWlpaWlpaWlpaWlpaWlpaW" +
  "lpaWlpaXmZqbnJ6go6OgnZqYlZKPjIuKi4yPkpWWlpaWlpaWlpaWlpaWlpaWl5mam5yempaSjoqGgn56dnJucHR3en6Cfnp+goaKhoJ+foKGioaCfnp2cm5w" +
  "cnJycG5ucnZ6foKEh4uOkpaanp6cm5qampqampqampqampqampqampqampucnp+goqSmpqOgnZqYlZKQjo6OkJKVmJqampqampqampqampqampqbnJ6foJ6a" +
  "lpKOioaCfnp2cm5ydXl8foJ+en6ChoqGgn5+goaKhoJ+enZycXR1dnV0cW5ydXl8foKGio6SlpqeoqCfnp6enp6enp6enp6enp6enp6enp6en6Cio6Slpqeo" +
  "pqOgnZqYlZSSkpKUlZianZ6enp6enp6enp6enp6enp+goqOinpqWko6KhoJ+enZybnJ2en6Cgn56foKGioaCfn6ChoqGgn56dnJ0d3l6eXd0cXB0d3p+goaK" +
  "jpKWmp6ipKOioqKioqKioqKioqKioqKioqKioqKjoqKioqKio6SlpKKgnZuZl5aWlpeZm52goqKioqKioqKioqKioqKio6SlpqKempaSjoqGgn56dnJwdHd6" +
  "foJ+fHp+goaKhoJ+foKGioaCfnp2cnV5fH58eXd0cnJ2en6ChoqOkpWZnKCkp6ampqampqampqampqampqampqSioJ+enp6enp6foKKgnpybmZeWlpaWlpeZ" +
  "m52go6ampqampqampqampqanqKelop6alpKOioaCfnp2cnJ1eXx+gn56en6ChoqGgn5+goaKhoJ+enZydnp+gn58eXV2dXZ6foKGiYyQlJebn6Onqqqqqqqq" +
  "qqqqqqqqqqqqqaajoJ6cm5qampqampucnp2bmZeVlJKSkpKSlJWYmp2go6apqqqqqqqqqqqqqqmmpKKgnJmVko6KhoJ+enZycnZ6foKCfnp6foKGioaCfn6C" +
  "hoqGgn56d3R2en6Cgn56eXp5d3p+goSHi46Slpqeoqaqrq6urq6urq6urq6urammo6Cdm5mXlpaWlpaWl5mbmpiVlJKQjo6Ojo6QkpWYmp2gpKerrq6urq6u" +
  "rqyppqOgnpybl5SQjImGgn56dnJydnp+goJ+enp+goaKhoJ+foKGioaCfnx5dXZ6foKCfnx8fnx5eXx+goaKjpKWmp6ipamtsbKysrKysrKysq6rp6SgnZqY" +
  "lZSSkpKSkpKUlZiYlZKQjoyLioqKi4yPkpWYm56ipamtsLKysrCtqaajoJ2bmZeWko6Lh4SCfnp2cnR3en6Cfnx5fH6ChomGgn5+goaJh4SCfnp2dXl8foKC" +
  "fn6Cfnp3en6ChoqOkpWZnKCkqKyvs7a2tra2trSxramlop6bmJWSkI6Ojo6OjpCSlZWSj4yLiYeGhoaHiYyPkpWZnKCkp6uusrSyrqunpKCdmpiVlJKSjoqG" +
  "gn58eXV1d3l8foJ+enp+goSHh4SCfn6ChIeJhoJ+enZ0d3p+goSCfoJ+enZ6foKGiYyQlJebn6Onq6+zt7q6urq3s6+sqKSgnJmVko+Mi4qKioqLjI+Sko+M" +
  "iYeGhIKCgoSHiYyQlJebnqKlqa2vsbGtqaWinpuYlZKQjo6OioaCfnp3d3l6fH6Cgn56en6ChomGgn58fH6ChoqGgn56dnJ1eXx+goSCgn56dnp+goSHi46S" +
  "lpqeoqaqrrK2ub2+u7ezr6uno5+bl5SQjImHhoaGhoeJjI+QjImHhIKCfn5+goSHi46SlZmcoKSnq6ytrqyopKCcmZWSj4yLioqJhoJ+enZ5fH5+goSCfnp6" +
  "foKGioaCfnp6foKGioaCfnp3dHR3en6ChIaCfnp2eXx+goaKjpKWmp6ipamtsbS4vL66trKuqqainpqWko6Lh4SCgoKChIeJjI6Lh4SCfn58enx+goaJjJCU" +
  "l5ueoqWnqKmrq6ejn5uXlJCMiYeGhoaEgn56dnp+goKCgn58eXp+goaKhoJ+enp+goaJhoJ+fHl1cnV5fH6ChoJ+enZ3en6ChoqOkpWZnKCkqKyvs7e7vrq2" +
  "sq6qpqKempaSjoqGgn5+fn6ChIeJjImGgn58enl3en6ChIeLjpKVmZygoqOkpaeppaKempaSjouHhIKCgoJ+fHl1eXx+fn5+fHl5fH6ChomGgn56en6ChIeH" +
  "hIJ+enZydHd6foKGgn56dnZ6foKGiYyQlJebn6Onq66ytrm9urayrqqmop6alpKOioaCfnx6fH6ChIeJh4SCfnp3dXV5fH6ChomMkJSXm56en6CipKWkoJyZ" +
  "lZKOioaCfn5+fnx5d3R3eXp6enp5d3p+goSHh4SCfnp5fH6ChomGgn56dnJydnp+goaCfnp2dnp+goSHi46SlpqeoqWprbG0uLy6trKuqqainpqWko6Lh4SC" +
  "fnp5fH6ChIeGgn58eXVydHd6foKEh4uOkpaampqbnJ6goqOfm5eUkIyJhoJ+enp6eXd0cXR1dnZ2dnV2en6ChomGgn58eXd6foKGioaCfnp3dHJ2en6ChoJ+" +
  "end1eXx+goaKjpKVmZygpKisr7O3ube2sq6qpqKempaSjouHhIJ+end5fH6ChIaCfnp3dHBydXl8foKGio6SlZaWlpeZm5yeoJ6alpKOi4eEgn56dnZ1dHFu" +
  "cHJycnJydHd6foKGioaCfnp3dnp+goaJhoJ+fHl1cnZ6foKEgn58eXV3en6ChomMkJSXm5+jp6uusra2tLKxrqqmop6alpKOioaCfnx5d3d5fH6CgoJ+enZy" +
  "bnB0d3p+goaJjJCSkpKSlJWXmZudnpqWko6KhoJ+fHl1cnJwbmtsbm5ubnJ1eXx+goaJhoJ+enZ2en6ChIeHhIJ+end0dXl8foKEgn56dnZ6foKEh4uOkpaa" +
  "nqKlqa2xtLKwrq2sqqainpqWko6KhoJ+fnx5d3d5fH5+fnx5dXJubnJ2en6ChIeLjo6Ojo6QkpSVmJqdmpaSjoqGgn56d3RwbmxraGlqamxwdHd6foKEh4eE" +
  "gn56dnV5fH6ChomGgn58eXV0d3p+goSCfnp2dXl8foKGio6SlZmcoKSorK+xr62rqainpaKempaSjouHhIKCfnx5dXd5enp6eXd0cGxucnV5fH6ChomKioqK" +
  "i4yOkJKVmJqalpKOioaCfnp2cm5raWdlZWZqbnJ1eXx+goaJhoJ+fHl1dHd6foKGiYeEgn56dnJ1eXx+gn58eXV0d3p+goaJjJCUl5ufo6errq6sqaelpKOi" +
  "oJ+bl5SQjImHhoSCfnp2dHV2dnZ1dHFua2xwdHd6foKEhoaGhoaHiYuMj5KVmJmVko6KhoJ+enZybmpmZGJkZ2tucnZ6foKEh4mGgn56d3Rydnp+goSHiYaC" +
  "fnp3dHR3eXx+fHl3dHJ2en6ChIeLjpKWmp6ipamtq6mmpKKgn56cm5qZlZKPjIuHhIJ+enZycnJycnJwbmtrbG5ydXl8foKCgoKCgoSGh4mMj5KVl5SQjImG" +
  "gn56dnJuamZiYmVpbHB0d3p+goaJh4SCfnp2cnJ1eXx+goaJhoJ+fHl1cnR3eXp5d3RxcnV5fH6ChoqOkpWZnKCkp6uppqOgnpybmpmXlpaWlZKOioaCfnx5" +
  "dXJycnJycG5ubm5wcnJ0d3l8fn5+fn5+goKEh4mMkJSWko6Lh4SCfnp2cm5qZmJkZ2tucnV5fH6ChomGgn58eXVycHR3en6ChIeHhIJ+end0cXR1dnV0cW5w" +
  "dHd6foKGiYyQlJebnqKlqaajoJ2bmZeWlZSSkpKUko6KhoJ+end2dnZ2dnV0cnJycnR1dnZ2d3l6enp6enx+foKEh4uOkpWSjoqGgn58eXVybmpmYmVpbHB0" +
  "d3p+goSHh4SCfnp3dHBucnV5fH6ChomGgn58eXVycHJycnBua25ydnp+goSHi46SlZmcoKSmo6CdmpiVlJKSkI6OjpCSjoqGgn56enp6enp6eXd2dnZ2d3l6" +
  "enp6enl3dnZ3eXp8foKGiYyQlJCMiYaCfnp3dHBsaWVkZ2tucnV5fH6ChomGgn58eXVybmxwdHd6foKGiYeEgn56d3Rwbm5ubGtqbnJ1eXx+goaJjJCUl5ue" +
  "oqSgnZqYlZKQjo6Mi4qLjI6OioaCfn5+fn5+fn58enp6enp6fH5+fn5+fHl1cnR1d3p+goSHi46SjouHhIJ+enZybmtnZGVpbHB0d3p+goSHiYaCfnp3dHBs" +
  "a25ydnp+goSHiYaCfnx5dXJua2ppZ2lscHR3en6ChIeLjpKVmZygop6bmJWSj4yLiomHhoeJioqKh4SCgoKCgoKCgn5+fn5+fn5+goKCgoJ+enZycnJ1eXx+" +
  "goaKjpKOioaCfnx5dXJuamZkZ2tucnV5fH6ChomHhIJ+enZybmtqbnJ1eXx+goaJh4SCfnp3dHBsaWZkZ2tucnV5fH6ChomMkJSXmp2gnJmVko+MiYeGhoSC" +
  "hIaGhoaGhoaGhoaGhoaEgoKCgoKCgoKCgoJ+fnx5dXZ2dnZ3en6ChomMkIyJhoJ+end0cGxpZWZpbHB0d3p+goSHiYaCfnx5dXJuamlscHR3en6ChIeJhoJ+" +
  "fHl1cm5raGVlaWxwdHd6foKEh4uOkpWYm56bl5SQjImHhIKCgn6CgoKCgoKCgoKCgoSGhoaEgoKCgoKCfn5+fnx6eXd5enp6enl6foKEh4uOi4eEgn56dnJu" +
  "a2dlaGtucnV5fH6ChomHhIJ+end0cGxpZ2tucnV5fH6ChomHhIJ+end0cW5rZ2Rna25ydXl8foKGiYyPkpWZm5qWko6Lh4SCfn5+fH5+fn5+fn5+fn5+goKC" +
  "goJ+fn5+fn58enp6eXd5enx+fn5+fHp8foKGioyJhoJ+fHl1cm5qZmdrbnF0d3p+goSHiYaCfnx5dXJua2dlaWxwdHd6foKEh4mGgn58eXd0cGxpZmVpbHB0" +
  "d3p+goSHiYyQlJWXmZaSjoqGgn5+fn5+fn5+fn5+fnx6enx+fn5+fnx6enp6enl3dnd5enx+foKCgoJ+fnx+goaJi4eEgn56d3RwbGlmaWxwdHd5fH6ChomH" +
  "hIJ+end0cGxpZWRna25ydXl8foKEh4eEgn58eXVybmtoZmdrbnJ1eXx+goSHi46QkpSVlpKOi4eEgoKCgoKCgoKCgoKCfn5+fn58enp6enl3dnZ2dXd5enx+" +
  "foKChIaGhIKCfn6ChIeJhoJ+fHl1cm5rZ2hrbnJ1eXx+goSHh4SCfnx5dXJua2dkYmVpbHB0d3l8foKGiYeEgn56d3RxbmtoZWlscHR3eXx+goaJi4yOkJKS" +
  "kpCMiYeGhoaGhoaGhoaGhoSCgoKCgn5+fn5+fHp5d3Z3eXx+foKChIaHiYmHhoJ+fH6ChoeEgn56d3RwbGloa25xdHd6foKEh4mGgn58eXd0cGxpZWJgZGdr" +
  "bnF0d3p+goSHiYaCfnx5d3RxbmtnZ2tucXR3en6ChIaHiYuMjo6Ojo6Mi4qKioqKioqKioqJh4aGhoaEgoKCgoJ+fnx6enp8foKChIaHiYuMjIuHhIJ+foKC" +
  "hIJ+fHl1cm5rZ2tucXR3eXx+goaJh4SCfnp3dHFua2dkYF5iZWhrbnJ1eXx+goSHh4SCfnx5d3RwbGlmaGtucnV5fH6CgoSGh4mKioqKioqKiouMjo6Ojo6O" +
  "joyLioqKiYeGhoaGhIKCfn5+fn6ChIaHiYuMjpCQjImGgn58fn6Cfnx5d3RwbGlpbHB0d3l8foKEh4eEgn58eXVybmtoZWJeXGBjZmlscHR3eXx+goaJh4SC" +
  "fnx5dXJua2hmaWxwdHd5fH5+goKEhoaGhoaGhoaGh4mMj5KSkpKSkI6Ojo6MiYeGhoaGhoSCgoKCgoSHiYuMjo6Ojo6MiYaCfnp6fH58eXd0cW5raGtucnV5" +
  "fH6ChIeJhoJ+fHl3dHBsaWZjYFxaXWBkZ2tucXR3en6ChIeJh4SCfnp3dHFua2hna25xdHd5enx+foKCgoKCgoKCgoKEh4mMj5KVlpWUko+Mi4mHhIKCgoKC" +
  "goKCgoKEh4mMjo+Mi4qKiomHhIJ+end5enl3dHFua2hrbnF0d3p+goSHiYeEgn56d3RxbmtnZGBdWldbXmJlaGtucnV5fH6ChIeJhoJ+fHl3dHFua2hoa25x" +
  "dHV3eXp8fn5+fn5+fn5+foKEh4mMj5KVlZKPjImHhoSCfn5+fn5+fn5+foKEh4uOjImHhoaGhoSCfnx5dXV2dXRxbmtoa25xdHd5fH6ChomHhIJ+fHl1cm5r" +
  "aGViXltXVVlcYGNmaWxwdHd5fH6ChomHhIJ+fHl3dHFua2hoa25wcnR1d3l6enp6enp6enp8foKEh4mMkJSUkIyJh4SCgn58enp6enp6enp8foKGioyJh4SC" +
  "goKCgn58eXd0cnJycG5raGtucXR3eXx+goSHh4SCfnx5d3RwbGlmY2BcWVVTV1pdYGRna25xdHd6foKEh4mHhIJ+fHl3dHFua2loa2xucHJ0dXZ2dnZ2dnZ2" +
  "d3l8foKEh4uOkpKOi4eEgn5+fHl3dnZ3eXp5d3p+goaKi4eEgn5+fn5+fHl3dHFubm5sa2lrbnF0d3l8foKEh4mGgn58eXd0cW5rZ2RgXVpXU1FUV1teYmVo" +
  "a25ydXl8foKEh4mHhIJ+fHl3dHFubGtoaWtsbnBycnJycnJycnJ0d3l8foKGio6Sko6KhoJ+fnx6enp6enp8fnx6en6ChoqKhoJ+fHp6enp5d3Rxbmtqamlr" +
  "bG5xdHd5fH6ChIeJh4SCfnp3dHFua2hlYl5bV1RRT1JVWVxgY2ZpbHB0d3l8foKEh4mHhIJ+fHl3dHJwbmtoZ2lrbG5ubm5ubm5ubnF0d3p+goaKjpKSjouH" +
  "hIKCfn5+fn5+fn6Cfn5+foKGioqGgn56d3Z2dnV0cW5raGZoa25wcnR3eXx+goSHiYeEgn58eXVybmtoZmNgXFlVUk9MUFNXWl1gZGdrbnF0d3l8foKEh4mH" +
  "hIJ+fHl3dXRxbmtpZ2dpampqampqampscHR3en6ChoqOkpSQjImHhoSCgoKCgoKCgoSCgoKChIeLioaCfnp2cnJycnBua2hnaWtucXR1d3l8foKEh4mHhIJ+" +
  "fHl3dHBsaWZjYF1aV1NQTEpOUVRXW15iZWhrbnF0d3l8foKEh4mHhIJ+fHp5d3RxbmxraWdmZmZmZmZmam5ydXl8foKGio6SlZKPjIuJh4aGhoaGhoaGh4aG" +
  "hoaHiYyJhoJ+enZybm5ubGtoaGtsbnF0d3l6fH6ChIeJh4SCfnx5d3RxbmtnZGBdWldUUU5KSExPUlVZXGBjZmhrbnF0d3l8foKEh4mHhIJ+fnx5d3RycG5s" +
  "a2hmZGJiYmZqbnJ2en6ChIeLjpKWlZKQjoyLioqKioqKioqLioqKiouMi4eEgn56dnJuamppZ2lrbnBydHd5fH5+goSHiYeEgn58eXd0cW5raGViXltXVVJP" +
  "TEhGSUxQU1daXWBjZmhrbnF0d3l8foKEh4mHhIKCfnx5d3V0cnBua2lnZWRiZmpucnZ6foKGiYyQlJeYlZSSkI6Ojo6Ojo6Ojo6Ojo6OjoyJhoJ+fHl1cm5q" +
  "Z2lrbG5xdHV3eXx+goKEh4mHhIJ+fHl3dHFua2hmY2BcWVVST0xJRkRHSk5RVFdaXWBjZmhrbnF0d3l8foKEh4mHhoSCfnx6eXd1dHFubGtpZ2Vmam5ydnp+" +
  "goSHi46SlJWWlpWUkpKSkpKSkpKSkpKSko+Mi4eEgn56d3RwbGlrbG5wcnR3eXp8foKEhoeJh4SCfnx5d3RxbmtoZmNgXVpXU1BMSUdEQkVITE9SVVdaXWBj" +
  "ZmhrbnF0d3l8foKEhoeJh4SCfn58enl3dHJwbmxraWdqbnJ1eXx+goaJjI6QkpKSkpKSkpKUlZaWlpWUkpCOjImHhoJ+fHl1cm5rbG5wcnR1d3l8fn6ChIeJ" +
  "iYeEgn58eXd0cW5raGZjYF1aV1RRTkpHREE/Q0ZJTE9SVVdaXWBjZmhrbnF0d3l8foKChIeJh4SCgn5+fHl3dXRycG5sa2pscHR3en6ChIeJi4yOjo6Ojo6O" +
  "jpCSkpKSkpCOjIuJh4SCgn56d3RwbG5wcnR1d3l6fH6CgoSHiYeGhIJ+fHl3dHFua2hmY2BdWldVUk9MSEVCPj1AREdJTE9SVVdaXWBjZmhrbnF0d3l8fn6C" +
  "hIeJh4aEgoJ+fHp5d3V0cnBubmxucnV5fH6ChIaHiYqKioqKioqLjI6Ojo6OjIuJh4aEgn5+fHl1cm5wcnR1d3l6fH5+goSGh4mHhIKCfnx5d3RxbmtoZmNg" +
  "XVpXVVJPTElGQz88Oz5BREdJTE9SVVdaXWBjZmhrbnF0d3l6fH6ChIaHiYeGhIJ+fnx6eXd1dHJycG5wdHd5fH6CgoSGhoaGhoaGhoeJioqKioqJh4aEgoJ+" +
  "fHp5d3RwcnR1d3l6fH5+goKEh4mHhoSCfn58eXd0cW5raGZjYF1aV1VST0xJR0RAPTo4Oz5BREdJTE9SVVdaXWBjZmhrbnF0dXd5fH6CgoSHiYmHhIKCfn58" +
  "enl3dnV0cnBxdHd5fH5+goKCgoKCgoKChIaGhoaGhoaEgoJ+fnx5d3V0cnR1d3l6fH5+goKEhoeJh4SCgn58enl3dHFua2hmY2BdWldVUk9MSUdEQT47ODY4" +
  "Oz5BREdJTE9SVVdaXWBjZmhrbnBydHd5fH5+goSGh4mHhoSCgn5+fHp6eXd1dHJydHd5enx+fn5+fn5+fn6CgoKCgoKCgoJ+fnx6eXd0dHV2d3l6fH5+goKE" +
  "hoeJh4aEgn5+fHl3dXRxbmtoZmNgXVpXVVJPTElHREE+Ozg1MzY4Oz5BREdJTE9SVVdaXWBjZmhrbG5xdHd5enx+goKEh4mJh4aEgoJ+fn58enl3dnZ1dHV3" +
  "eXp6enp6enp6fH5+fn5+fn5+fnx6eXd1dnZ3eXp6fH5+goKEhoeJiYeEgoJ+fHp5d3RycG5raGZjYF1aV1VST0xJR0RBPjs4NjMwMzY4Oz5BREdJTE9SVVda" +
  "XWBjZWdpa25xdHV3eXx+foKEhoeJiYeGhIKCgn5+fHp6enl3dnZ2dnZ2dnZ2dnd5enp6enp6enp6eXd2d3l6enp8fn5+goKEhoeJiYeGhIJ+fnx5d3V0cW5s" +
  "a2hmY2BdWldVUk9MSUdEQT47ODYzMC0wMzY4Oz5BREdJTE9SVVdaXWBiZGZoa25wcnR3eXp8foKChIaHiYmHhoaEgoJ+fn5+fHp6enp5d3Z2dnZ2dnZ2dnZ2" +
  "dnZ2d3l6enp6fH5+fn6CgoKEhoeJiYeGhIKCfnx6eXd0cnBua2lnZWNgXVpXVVJPTElHREE+Ozg2MzAtKi0wMzY4Oz5BREdJTE9SVVdaXF5gY2Zoa2xucXR1" +
  "d3l8fn6CgoSGhoeJiYeGhIKCgoJ+fn5+fnx6enp6enp6enp6enp6enp6fH5+fn5+goKCgoSGhoeJh4aGhIKCfn58eXd1dHFubGtoZmRiYF1aV1VST0xJR0RB" +
  "Pjs4NjMwLSonKi0wMzY4Oz5BREdJTE9SVFdZW11gY2VnaWtucHJ0d3l6fH5+goKChIaHiYmHhoaGhIKCgoKCfn5+fn5+fn5+fn5+fn5+fn5+goKCgoKEhoaG" +
  "h4mJh4aEgoKCfn58enl3dHJwbmtpZ2VjYF5cWldVUk9MSUdEQT47ODYzMC0qJyUnKi0wMzY4Oz5BREdJTE9RU1VXWl1gYmRmaGtsbnF0dXd5enx+fn6CgoSG" +
  "hoeJiomHhoaGhoSCgoKCgoKCgoKCgoKCgoKCgoKEhoaGhoeJiomHhoaEgoJ+fn58enl3dXRxbmxraGZkYmBdW1lXVFJPTElHREE+Ozg2MzAtKiclIiUnKi0w" +
  "MzY4Oz5BREdJTE5QUlVXWlxeYGNlZ2lrbnBydHV3eXp6fH5+goKChIaGhoeJioqJh4aGhoaGhoaGhoaGhoaGhoaGhoeJioqJh4aGhoSCgoJ+fnx6enl3dXRy" +
  "cG5raWdlY2BeXFpXVVNRT0xJR0RBPjs4NjMwLSonJSIfIiUnKi0wMzY4Oz5BREZISkxPUlRXWVtdYGJkZmhrbG5wcnR1dnd5enx+fn6CgoKChIaGhoaHiYqK" +
  "ioqKioqKioqKioqKioqJh4aGhoaEgoKCgn5+fnx6eXd2dXRycG5sa2hmZGJgXVtZV1RSUE5MSUdEQT47ODYzMC0qJyUiHxwfIiUnKi0wMzY4Oz5AQ0VHSUxP" +
  "UVNVV1pcXmBjZWdpa2xucHJydHV3eXp6fH5+fn6CgoKCgoSGhoaGhoaGhoaGhoaGhoaGhoaEgoKCgoJ+fn5+fHp6eXd1dHJycG5sa2lnZWNgXlxaV1VTUU9M" +
  "SkhGREE+Ozg2MzAtKiclIh8cGRwfIiUnKi0wMzY4Oz0/QkRHSUxOUFJUV1lbXWBiZGVnaWtsbm5wcnR1dnd5enp6fH5+fn5+goKCgoKCgoKCgoKCgoKCgoKC" +
  "goJ+fn5+fnx6enp5d3Z1dHJwbm5sa2lnZWRiYF1bWVdUUlBOTElHRUNAPjs4NjMwLSonJSIfHBkXGRwfIiUnKi0wMzU4Ojw+QURGSEpMT1FTVVdaXF5gYmRl" +
  "Z2lqa2xucHJydHV2dnd5enp6enx+fn5+fn5+fn5+fn5+fn5+fn5+fnx6enp6eXd2dnV0cnJwbmxramlnZWRiYF5cWldVU1FPTEpIRkRCPz07ODYzMC0qJyUi" +
  "HxwZFw==";

let decoded: Uint8Array | null = null;

function field(): Uint8Array {
  if (decoded) return decoded;
  const binary = atob(ENCODED);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  decoded = bytes;
  return bytes;
}

function at(x: number, y: number): number {
  return field()[y * FACE_MASK_SIZE + x];
}

/**
 * Sample The Face in normalized island coordinates, from -1 to 1.
 *
 * The returned distance uses those same normalized units. Zero is the exact
 * source boundary; positive values lie inside land.
 */
export function sampleFaceDistance(x: number, z: number): number {
  if (x < -1 || x > 1 || z < -1 || z > 1) {
    const dx = Math.max(Math.abs(x) - 1, 0);
    const dz = Math.max(Math.abs(z) - 1, 0);
    return -Math.sqrt(dx * dx + dz * dz);
  }

  const fx = (x * 0.5 + 0.5) * (FACE_MASK_SIZE - 1);
  const fy = (z * 0.5 + 0.5) * (FACE_MASK_SIZE - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, FACE_MASK_SIZE - 1);
  const y1 = Math.min(y0 + 1, FACE_MASK_SIZE - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  const encoded = top + (bottom - top) * ty;
  return ((encoded - 128) / QUARTERS_PER_PIXEL) * NORMALIZED_PIXEL;
}
